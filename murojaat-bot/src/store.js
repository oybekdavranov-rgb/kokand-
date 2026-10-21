'use strict';
/* =====================================================================
   Ma'lumotlar qatlami — SQLite (WAL).
   Bu botda baza faqat ichki ehtiyoj uchun: murojaat raqamlari, javobni
   kimga yuborishni bilish (marshrut), chegaralar va holat.
   MUROJAATLARNING O'ZI Telegram'da — admin chatida saqlanib qoladi.
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const { config } = require('./config');

let Database;
try {
  Database = require('better-sqlite3');
} catch (err) {
  console.error('\n  ⛔️ Ma\'lumotlar bazasi moduli (better-sqlite3) yuklanmadi.\n');
  console.error('  Sabab: ' + String(err.message).split('\n')[0]);
  console.error('\n  Yechim:  npm rebuild better-sqlite3 --build-from-source');
  console.error('  Yordam bermasa:  rm -rf node_modules package-lock.json && npm install\n');
  console.error('  Node versiyasi: ' + process.version + ' (kamida v20 kerak)\n');
  process.exit(1);
}

try {
  fs.mkdirSync(path.dirname(config.dbFile), { recursive: true, mode: 0o700 });
} catch (err) {
  console.error(`\n  ⛔️ DATA_DIR ga yozib bo'lmadi: ${path.dirname(config.dbFile)} (${err.code})\n`);
  process.exit(1);
}

const db = new Database(config.dbFile);
try {
  db.pragma('journal_mode = WAL');
} catch (err) {
  db.pragma('journal_mode = DELETE');       // ba'zi fayl tizimlari WAL'ni ko'tarmaydi
}
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');

let chmodWarned = false;
function lockDownFiles() {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.chmodSync(config.dbFile + suffix, 0o600); }
    catch (err) {
      if (!chmodWarned && err.code !== 'ENOENT') {
        chmodWarned = true;
        console.warn('fayl huquqlari o\'rnatilmadi (FS chmod qo\'llab-quvvatlamaydi): ' + err.code);
      }
    }
  }
}

/* =====================================================================
   SXEMA
   ===================================================================== */
const MIGRATIONS = [
  () => db.exec(`
    CREATE TABLE users (
      tg_id        INTEGER PRIMARY KEY,
      username     TEXT,
      first_name   TEXT,
      last_name    TEXT,
      phone        TEXT,
      lang         TEXT,
      first_seen   INTEGER NOT NULL,
      last_seen    INTEGER NOT NULL,
      is_blocked   INTEGER NOT NULL DEFAULT 0,
      block_reason TEXT,
      blocked_at   INTEGER
    );

    CREATE TABLE appeals (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      code            TEXT    NOT NULL UNIQUE,
      tg_id           INTEGER NOT NULL REFERENCES users(tg_id) ON DELETE CASCADE,
      author_name     TEXT,
      author_username TEXT,
      author_phone    TEXT,
      body            TEXT    NOT NULL,
      status          TEXT    NOT NULL DEFAULT 'new',
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL,
      answered_at     INTEGER,
      progress_notified_at INTEGER,
      chat_id         INTEGER NOT NULL,
      message_id      INTEGER
    );
    CREATE INDEX appeals_created ON appeals(created_at DESC);
    CREATE INDEX appeals_status  ON appeals(status, created_at DESC);
    CREATE INDEX appeals_tg      ON appeals(tg_id, created_at DESC);
    CREATE INDEX appeals_message ON appeals(tg_id, chat_id, message_id);

    CREATE TABLE attachments (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      appeal_id  INTEGER NOT NULL REFERENCES appeals(id) ON DELETE CASCADE,
      kind       TEXT    NOT NULL,
      file_id    TEXT    NOT NULL,
      file_name  TEXT,
      file_size  INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX attachments_appeal ON attachments(appeal_id);

    /* Admin chatidagi xabar ↔ murojaat. "Reply" shu orqali topiladi. */
    CREATE TABLE routes (
      chat_id    INTEGER NOT NULL,
      message_id INTEGER NOT NULL,
      appeal_id  INTEGER NOT NULL REFERENCES appeals(id) ON DELETE CASCADE,
      is_header  INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (chat_id, message_id)
    );
    CREATE INDEX routes_appeal ON routes(appeal_id);

    CREATE TABLE replies (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      appeal_id      INTEGER NOT NULL REFERENCES appeals(id) ON DELETE CASCADE,
      author         TEXT    NOT NULL,
      body           TEXT    NOT NULL,
      created_at     INTEGER NOT NULL,
      delivered      INTEGER NOT NULL DEFAULT 0,
      delivery_error TEXT
    );
    CREATE INDEX replies_appeal ON replies(appeal_id, created_at);

    CREATE TABLE settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `),
];

(function migrate() {
  const current = db.pragma('user_version', { simple: true });
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      MIGRATIONS[v]();
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
  lockDownFiles();
})();

const now = () => Date.now();
const STATUSES = ['new', 'in_progress', 'answered', 'closed'];

/* ---------------------------- Sozlamalar ---------------------------- */
const qGetSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
const qSetSetting = db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);
const getSetting = (key, def = null) => { const row = qGetSetting.get(key); return row ? row.value : def; };
const setSetting = (key, value) => qSetSetting.run(key, String(value), now());

/* -------------------------- Foydalanuvchilar ------------------------ */
const qUpsertUser = db.prepare(`
  INSERT INTO users (tg_id, username, first_name, last_name, lang, first_seen, last_seen)
  VALUES (@tg_id, @username, @first_name, @last_name, @lang, @ts, @ts)
  ON CONFLICT(tg_id) DO UPDATE SET
    username = excluded.username, first_name = excluded.first_name,
    last_name = excluded.last_name, lang = excluded.lang, last_seen = excluded.last_seen`);
const qGetUser = db.prepare('SELECT * FROM users WHERE tg_id = ?');
const qSetPhone = db.prepare('UPDATE users SET phone = ? WHERE tg_id = ?');
const qSetBlocked = db.prepare('UPDATE users SET is_blocked = ?, block_reason = ?, blocked_at = ? WHERE tg_id = ?');
const qListBlocked = db.prepare('SELECT * FROM users WHERE is_blocked = 1 ORDER BY blocked_at DESC LIMIT ?');

function upsertUser(user) {
  qUpsertUser.run({
    tg_id: user.id,
    username: user.username || null,
    first_name: user.first_name || null,
    last_name: user.last_name || null,
    lang: user.language_code || null,
    ts: now(),
  });
  return qGetUser.get(user.id);
}
const getUser = (tgId) => qGetUser.get(tgId);
const setUserPhone = (tgId, phone) => qSetPhone.run(phone, tgId);
const setUserBlocked = (tgId, blocked, reason = null) =>
  qSetBlocked.run(blocked ? 1 : 0, blocked ? reason : null, blocked ? now() : null, tgId);
const listBlocked = (limit = 20) => qListBlocked.all(limit);

/* ----------------------------- Murojaatlar -------------------------- */
const qInsertAppeal = db.prepare(`
  INSERT INTO appeals (code, tg_id, author_name, author_username, author_phone, body, status, created_at, updated_at, chat_id, message_id)
  VALUES (@code, @tg_id, @author_name, @author_username, @author_phone, @body, 'new', @ts, @ts, @chat_id, @message_id)`);
const qCountYear = db.prepare('SELECT COUNT(*) AS n FROM appeals WHERE code LIKE ?');
const qFindByMessage = db.prepare('SELECT * FROM appeals WHERE tg_id = ? AND chat_id = ? AND message_id = ? LIMIT 1');
const qGetAppeal = db.prepare('SELECT * FROM appeals WHERE id = ?');
const qGetByCode = db.prepare('SELECT * FROM appeals WHERE code = ? COLLATE NOCASE');

const createAppeal = db.transaction((data) => {
  if (data.messageId) {
    const existing = qFindByMessage.get(data.tgId, data.chatId, data.messageId);
    if (existing) return { ...existing, duplicate: true };       // takroriy update
  }
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 5; attempt++) {
    const prefix = `MR-${year}-`;
    const code = attempt === 0
      ? prefix + String(qCountYear.get(prefix + '%').n + 1).padStart(4, '0')
      : prefix + require('crypto').randomBytes(3).toString('hex').toUpperCase();
    try {
      const info = qInsertAppeal.run({
        code,
        tg_id: data.tgId,
        author_name: data.authorName || null,
        author_username: data.authorUsername || null,
        author_phone: data.authorPhone || null,
        body: data.body,
        ts: now(),
        chat_id: data.chatId,
        message_id: data.messageId || null,
      });
      return qGetAppeal.get(Number(info.lastInsertRowid));
    } catch (err) {
      if (!String(err.message).includes('UNIQUE')) throw err;
    }
  }
  throw new Error('Murojaat raqamini yaratib bo\'lmadi');
});

const getAppeal = (id) => qGetAppeal.get(id);
const getAppealByCode = (code) => qGetByCode.get(String(code).trim());

const qRecentAppeal = db.prepare('SELECT * FROM appeals WHERE tg_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1');
const getRecentAppealOfUser = (tgId, sinceMs) => qRecentAppeal.get(tgId, sinceMs);

const qUserAppeals = db.prepare('SELECT * FROM appeals WHERE tg_id = ? ORDER BY created_at DESC LIMIT ?');
const listUserAppeals = (tgId, limit = 10) => qUserAppeals.all(tgId, limit);

const qCountSince = db.prepare('SELECT COUNT(*) AS n FROM appeals WHERE tg_id = ? AND created_at > ?');
const countAppealsSince = (tgId, sinceMs) => qCountSince.get(tgId, sinceMs).n;

const qLastAppealAt = db.prepare('SELECT created_at FROM appeals WHERE tg_id = ? ORDER BY created_at DESC LIMIT 1');
const lastAppealAt = (tgId) => qLastAppealAt.get(tgId)?.created_at || 0;

const qSetStatus = db.prepare(`
  UPDATE appeals SET status = @status, updated_at = @ts,
    answered_at = CASE WHEN @status IN ('answered','closed') THEN COALESCE(answered_at, @answeredAt) ELSE NULL END
  WHERE id = @id`);
function setAppealStatus(id, status) {
  if (!STATUSES.includes(status)) throw new Error('Noto\'g\'ri status');
  const ts = now();
  qSetStatus.run({ status, ts, answeredAt: status === 'answered' ? ts : null, id });
  return getAppeal(id);
}

const qTouch = db.prepare('UPDATE appeals SET updated_at = ? WHERE id = ?');
const touchAppeal = (id) => qTouch.run(now(), id);

const qSetAppealPhone = db.prepare('UPDATE appeals SET author_phone = ? WHERE id = ? AND author_phone IS NULL');
const setAppealPhone = (id, phone) => qSetAppealPhone.run(phone, id);

const qMarkProgress = db.prepare('UPDATE appeals SET progress_notified_at = ? WHERE id = ?');
const markProgressNotified = (id) => qMarkProgress.run(now(), id);

const qOverdue = db.prepare(`
  SELECT * FROM appeals WHERE status IN ('new','in_progress') AND created_at < ?
  ORDER BY created_at LIMIT ?`);
const listOverdue = (slaMs, limit = 10) => qOverdue.all(now() - slaMs, limit);

function stats(slaMs = 48 * 3600_000) {
  const base = db.prepare(`SELECT
      COUNT(*) AS total,
      SUM(status = 'new')         AS new_count,
      SUM(status = 'in_progress') AS in_progress,
      SUM(status = 'answered')    AS answered,
      SUM(status = 'closed')      AS closed,
      SUM(created_at > ?)         AS last_24h
    FROM appeals`).get(now() - 24 * 3600_000);
  const overdue = db.prepare(`SELECT COUNT(*) AS n FROM appeals
    WHERE status IN ('new','in_progress') AND created_at < ?`).get(now() - slaMs).n;
  const authors = db.prepare('SELECT COUNT(DISTINCT tg_id) AS n FROM appeals').get().n;
  const blocked = db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_blocked = 1').get().n;
  return {
    total: base.total || 0,
    new: base.new_count || 0,
    inProgress: base.in_progress || 0,
    answered: base.answered || 0,
    closed: base.closed || 0,
    last24h: base.last_24h || 0,
    overdue, authors, blocked,
  };
}

/* ------------------------------ Ilovalar ---------------------------- */
const qAddAttachment = db.prepare(`
  INSERT INTO attachments (appeal_id, kind, file_id, file_name, file_size, created_at)
  VALUES (@appeal_id, @kind, @file_id, @file_name, @file_size, @ts)`);
const addAttachment = (appealId, att) => qAddAttachment.run({
  appeal_id: appealId, kind: att.kind, file_id: att.fileId,
  file_name: att.fileName || null, file_size: att.fileSize || null, ts: now(),
});
const qCountAttachments = db.prepare('SELECT COUNT(*) AS n FROM attachments WHERE appeal_id = ?');
const countAttachments = (appealId) => qCountAttachments.get(appealId).n;

/* --------------------- Marshrutlar (reply uchun) -------------------- */
const qAddRoute = db.prepare(`INSERT OR REPLACE INTO routes (chat_id, message_id, appeal_id, is_header, created_at)
  VALUES (?, ?, ?, ?, ?)`);
const addRoute = (chatId, messageId, appealId, isHeader = 0) => qAddRoute.run(chatId, messageId, appealId, isHeader ? 1 : 0, now());

const qFindRoute = db.prepare('SELECT * FROM routes WHERE chat_id = ? AND message_id = ?');
const findRoute = (chatId, messageId) => qFindRoute.get(chatId, messageId);

const qHeaderRoutes = db.prepare('SELECT * FROM routes WHERE appeal_id = ? AND is_header = 1');
const listHeaderRoutes = (appealId) => qHeaderRoutes.all(appealId);

/* ------------------------------ Javoblar ---------------------------- */
const qAddReply = db.prepare(`INSERT INTO replies (appeal_id, author, body, created_at, delivered)
  VALUES (?, ?, ?, ?, 0)`);
const addReply = (appealId, { author, body }) => Number(qAddReply.run(appealId, author, body, now()).lastInsertRowid);

const qMarkDelivered = db.prepare('UPDATE replies SET delivered = ?, delivery_error = ? WHERE id = ?');
const markReplyDelivered = (id, ok, error = null) =>
  qMarkDelivered.run(ok ? 1 : 0, ok ? null : String(error || '').slice(0, 300), id);

const qListReplies = db.prepare('SELECT * FROM replies WHERE appeal_id = ? ORDER BY created_at');
const listReplies = (appealId) => qListReplies.all(appealId);

/* ------------------------------ Xizmat ------------------------------ */
const dataVersion = () => db.pragma('data_version', { simple: true });
async function backupTo(targetPath) {
  await db.backup(targetPath);
  try { fs.chmodSync(targetPath, 0o600); } catch { /* muhim emas */ }
  return targetPath;
}
function close() { try { db.close(); } catch { /* yopilgan */ } }

module.exports = {
  db, STATUSES, lockDownFiles, dataVersion, backupTo, close,
  getSetting, setSetting,
  upsertUser, getUser, setUserPhone, setUserBlocked, listBlocked,
  createAppeal, getAppeal, getAppealByCode, getRecentAppealOfUser, listUserAppeals,
  countAppealsSince, lastAppealAt, setAppealStatus, touchAppeal, setAppealPhone,
  markProgressNotified, listOverdue, stats,
  addAttachment, countAttachments,
  addRoute, findRoute, listHeaderRoutes,
  addReply, markReplyDelivered, listReplies,
};
