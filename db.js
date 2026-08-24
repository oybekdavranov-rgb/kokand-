/* =====================================================================
   PostgreSQL data layer (Railway / any Postgres).
   Loaded ONLY when DATABASE_URL is set. Requires the optional `pg`
   package:  npm install pg
   Exposes the same interface as the file store (see lib/store.js).
   ===================================================================== */
'use strict';

function createPgStore({ seed, hashIp, onStats }) {
  let Pool;
  try { ({ Pool } = require('pg')); }
  catch (e) {
    throw new Error("DATABASE_URL is set but the 'pg' package is not installed. Run: npm install pg");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
    max: parseInt(process.env.PG_POOL_MAX || '10', 10),
  });

  const RECENT_CAP = 500;

  async function init() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS site_state (
        id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        doc JSONB NOT NULL,
        version INT NOT NULL DEFAULT 1,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS revisions (
        id SERIAL PRIMARY KEY,
        doc JSONB NOT NULL,
        version INT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS site_meta (
        id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        launched_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS events (
        id BIGSERIAL PRIMARY KEY,
        ts TIMESTAMPTZ NOT NULL DEFAULT now(),
        type TEXT NOT NULL,
        target TEXT,
        query TEXT,
        path TEXT,
        ip_hash TEXT
      );
      CREATE INDEX IF NOT EXISTS events_ts_idx ON events (ts);
      CREATE INDEX IF NOT EXISTS events_type_idx ON events (type);
      CREATE TABLE IF NOT EXISTS view_counts (
        target TEXT PRIMARY KEY,
        count BIGINT NOT NULL DEFAULT 0
      );
    `);
    await pool.query(`INSERT INTO site_meta (id) VALUES (1) ON CONFLICT (id) DO NOTHING;`);
    const { rows } = await pool.query('SELECT 1 FROM site_state WHERE id = 1');
    if (rows.length === 0) {
      await pool.query('INSERT INTO site_state (id, doc, version) VALUES (1, $1, 1)', [seed]);
    }
  }

  async function getData() {
    const { rows } = await pool.query('SELECT doc FROM site_state WHERE id = 1');
    return rows[0] ? rows[0].doc : seed;
  }

  async function getVersion() {
    const { rows } = await pool.query('SELECT version FROM site_state WHERE id = 1');
    return rows[0] ? rows[0].version : 0;
  }

  // Optimistic locking: if expectedVersion is provided and mismatches -> conflict.
  async function saveData(doc, expectedVersion) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cur = await client.query('SELECT version FROM site_state WHERE id = 1 FOR UPDATE');
      const version = cur.rows[0] ? cur.rows[0].version : 0;
      if (expectedVersion != null && Number(expectedVersion) !== version) {
        await client.query('ROLLBACK');
        return { ok: false, conflict: true, version };
      }
      const next = version + 1;
      await client.query(
        'UPDATE site_state SET doc = $1, version = $2, updated_at = now() WHERE id = 1',
        [doc, next]
      );
      await client.query('INSERT INTO revisions (doc, version) VALUES ($1, $2)', [doc, next]);
      await client.query('COMMIT');
      return { ok: true, version: next };
    } catch (e) {
      await client.query('ROLLBACK'); throw e;
    } finally { client.release(); }
  }

  async function resetData(seedDoc) {
    const res = await saveData(seedDoc, null);
    return res;
  }

  function dayKey(d) { return new Date(d).toISOString().slice(0, 10); }

  async function recordVisit({ path, ip, ua }) {
    await pool.query(
      'INSERT INTO events (type, path, ip_hash) VALUES ($1, $2, $3)',
      ['visit', String(path || '').slice(0, 512), hashIp(ip)]
    );
    if (onStats) onStats();
  }

  async function recordEvent({ type, target, query, ip }) {
    if (!['view', 'click', 'search'].includes(type)) return;
    await pool.query(
      'INSERT INTO events (type, target, query, ip_hash) VALUES ($1,$2,$3,$4)',
      [type, target ? String(target).slice(0, 128) : null,
       query ? String(query).slice(0, 256) : null, hashIp(ip)]
    );
    if (type === 'view' && target) {
      await pool.query(
        `INSERT INTO view_counts (target, count) VALUES ($1, 1)
         ON CONFLICT (target) DO UPDATE SET count = view_counts.count + 1`,
        [String(target).slice(0, 128)]
      );
    }
    if (onStats) onStats();
  }

  async function getPublicStats() {
    const [views, visits] = await Promise.all([
      pool.query('SELECT target, count FROM view_counts'),
      pool.query("SELECT count(*)::int AS c FROM events WHERE type = 'visit'"),
    ]);
    const v = {};
    for (const r of views.rows) v[r.target] = Number(r.count);
    return { totalVisits: visits.rows[0].c, views: v };
  }

  async function getAdminStats() {
    const meta = await pool.query('SELECT launched_at FROM site_meta WHERE id = 1');
    const [totals, byDay, byHour, topViewed, topClicked, topSearched, recent] = await Promise.all([
      pool.query("SELECT count(*)::int c FROM events WHERE type='visit'"),
      pool.query(`SELECT to_char(ts,'YYYY-MM-DD') d, count(*)::int c FROM events
                  WHERE type='visit' GROUP BY d ORDER BY d DESC LIMIT 60`),
      pool.query(`SELECT extract(hour from ts)::int h, count(*)::int c FROM events
                  WHERE type='visit' GROUP BY h ORDER BY h`),
      pool.query('SELECT target, count FROM view_counts ORDER BY count DESC LIMIT 20'),
      pool.query(`SELECT target, count(*)::int c FROM events WHERE type='click' AND target IS NOT NULL
                  GROUP BY target ORDER BY c DESC LIMIT 20`),
      pool.query(`SELECT query, count(*)::int c FROM events WHERE type='search' AND query IS NOT NULL
                  GROUP BY query ORDER BY c DESC LIMIT 20`),
      pool.query(`SELECT ts, type, target, query FROM events ORDER BY ts DESC LIMIT ${RECENT_CAP}`),
    ]);
    return {
      launchedAt: meta.rows[0] ? meta.rows[0].launched_at : null,
      totalVisits: totals.rows[0].c,
      dataVersion: await getVersion(),
      visitsByDay: Object.fromEntries(byDay.rows.map((r) => [r.d, r.c])),
      visitsByHour: Object.fromEntries(byHour.rows.map((r) => [r.h, r.c])),
      topViewed: topViewed.rows.map((r) => ({ id: r.target, count: Number(r.count) })),
      topClicked: topClicked.rows.map((r) => ({ id: r.target, count: r.c })),
      topSearched: topSearched.rows.map((r) => ({ q: r.query, count: r.c })),
      recent: recent.rows.map((r) => ({
        ts: r.ts, type: r.type, target: r.target, query: r.query,
      })),
    };
  }

  return {
    kind: 'postgres',
    init, getData, getVersion, saveData, resetData,
    recordVisit, recordEvent, getPublicStats, getAdminStats,
    close: () => pool.end(),
  };
}

module.exports = { createPgStore };
