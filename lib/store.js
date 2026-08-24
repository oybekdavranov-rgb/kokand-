/* =====================================================================
   Storage layer.
   - Default: JSON files (backward compatible with the original app).
       * data.json      -> the org structure (UNCHANGED format)
       * analytics.json -> analytics sidecar (NEVER mixed into data.json)
   - If DATABASE_URL is set: PostgreSQL (see db.js).

   Both backends expose the same async interface, so server.js does not
   care which one is active. The file backend caches in memory and writes
   through with a short debounce, so requests never block on disk I/O
   (audit finding KU-06).
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { hashIp } = require('./auth');

function emptyAnalytics() {
  return {
    launchedAt: new Date().toISOString(),
    totalVisits: 0,
    dataVersion: 1,
    visitsByDay: {},
    visitsByHour: {},
    views: {},
    clicks: {},
    searches: {},
    recent: [],
  };
}

function atomicWrite(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, data, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/* ------------------------------------------------------------------ */
/* File backend                                                        */
/* ------------------------------------------------------------------ */
function createFileStore({ dataFile, seed, secret, onStats }) {
  const analyticsFile = process.env.ANALYTICS_FILE ||
    path.join(path.dirname(dataFile), 'analytics.json');
  const RECENT_CAP = 500;

  let data = null;       // cached structure
  let version = 1;
  let analytics = null;  // cached analytics
  let dirtyData = false, dirtyAnalytics = false, flushTimer = null;

  function loadJson(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { return fallback; }
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(flush, 800);
    if (flushTimer.unref) flushTimer.unref();
  }
  function flush() {
    flushTimer = null;
    try {
      if (dirtyData) { atomicWrite(dataFile, JSON.stringify(data)); dirtyData = false; }
      if (dirtyAnalytics) { atomicWrite(analyticsFile, JSON.stringify(analytics)); dirtyAnalytics = false; }
    } catch (e) { console.error('  ! flush error:', e.message); }
  }

  async function init() {
    data = loadJson(dataFile, null);
    if (!data) { data = seed; dirtyData = true; }
    analytics = loadJson(analyticsFile, null);
    if (!analytics) { analytics = emptyAnalytics(); dirtyAnalytics = true; }
    version = analytics.dataVersion || 1;
    flush();
  }

  async function getData() { return data; }
  async function getVersion() { return version; }

  async function saveData(doc, expectedVersion) {
    if (expectedVersion != null && Number(expectedVersion) !== version) {
      return { ok: false, conflict: true, version };
    }
    data = doc;
    version += 1;
    analytics.dataVersion = version;
    dirtyData = true; dirtyAnalytics = true;
    flush(); // persist structure immediately (important content)
    return { ok: true, version };
  }

  async function resetData(seedDoc) {
    data = seedDoc;
    version += 1;
    analytics.dataVersion = version;
    dirtyData = true; dirtyAnalytics = true;
    flush();
    return { ok: true, version };
  }

  function dayKey(d) { return new Date(d).toISOString().slice(0, 10); }
  function pushRecent(rec) {
    analytics.recent.unshift(rec);
    if (analytics.recent.length > RECENT_CAP) analytics.recent.length = RECENT_CAP;
  }

  async function recordVisit({ path: p, ip, ua }) {
    const now = new Date();
    analytics.totalVisits += 1;
    const d = dayKey(now);
    analytics.visitsByDay[d] = (analytics.visitsByDay[d] || 0) + 1;
    const h = String(now.getHours());
    analytics.visitsByHour[h] = (analytics.visitsByHour[h] || 0) + 1;
    pushRecent({ ts: now.toISOString(), type: 'visit', path: String(p || '').slice(0, 512) });
    dirtyAnalytics = true; scheduleFlush();
    if (onStats) onStats();
  }

  async function recordEvent({ type, target, query, ip }) {
    if (!['view', 'click', 'search'].includes(type)) return;
    const now = new Date();
    if (type === 'view' && target) {
      analytics.views[target] = (analytics.views[target] || 0) + 1;
    } else if (type === 'click' && target) {
      analytics.clicks[target] = (analytics.clicks[target] || 0) + 1;
    } else if (type === 'search' && query) {
      const q = String(query).slice(0, 256);
      analytics.searches[q] = (analytics.searches[q] || 0) + 1;
    }
    pushRecent({
      ts: now.toISOString(), type,
      target: target ? String(target).slice(0, 128) : undefined,
      query: query ? String(query).slice(0, 256) : undefined,
    });
    dirtyAnalytics = true; scheduleFlush();
    if (onStats) onStats();
  }

  async function getPublicStats() {
    return { totalVisits: analytics.totalVisits, views: analytics.views };
  }

  function topN(obj, n, keyName) {
    return Object.entries(obj)
      .sort((a, b) => b[1] - a[1]).slice(0, n)
      .map(([k, v]) => keyName === 'q' ? { q: k, count: v } : { id: k, count: v });
  }

  async function getAdminStats() {
    return {
      launchedAt: analytics.launchedAt,
      totalVisits: analytics.totalVisits,
      dataVersion: version,
      visitsByDay: analytics.visitsByDay,
      visitsByHour: analytics.visitsByHour,
      topViewed: topN(analytics.views, 20, 'id'),
      topClicked: topN(analytics.clicks, 20, 'id'),
      topSearched: topN(analytics.searches, 20, 'q'),
      recent: analytics.recent.slice(0, RECENT_CAP),
    };
  }

  return {
    kind: 'file',
    init, getData, getVersion, saveData, resetData,
    recordVisit, recordEvent, getPublicStats, getAdminStats,
    close: () => { flush(); },
  };
}

/* ------------------------------------------------------------------ */
/* Factory + real-time event bus                                       */
/* ------------------------------------------------------------------ */
function createStore({ dataFile, seed, secret }) {
  const bus = new EventEmitter();
  bus.setMaxListeners(0);
  let debounce = null;
  const onStats = () => {                 // coalesce bursts into ~1 push / 400ms
    if (debounce) return;
    debounce = setTimeout(async () => {
      debounce = null;
      try { bus.emit('stats', await store.getPublicStats()); } catch (e) {}
    }, 400);
    if (debounce.unref) debounce.unref();
  };
  const ipHasher = (ip) => hashIp(ip, secret);

  let store;
  if (process.env.DATABASE_URL) {
    const { createPgStore } = require('../db');
    store = createPgStore({ seed, hashIp: ipHasher, onStats });
  } else {
    store = createFileStore({ dataFile, seed, secret, onStats });
  }
  store.bus = bus;
  return store;
}

module.exports = { createStore, emptyAnalytics };
