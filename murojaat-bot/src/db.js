'use strict';
/* =====================================================================
   Ma'lumotlar qatlami — SQLite (WAL). Barcha so'rovlar faqat
   "prepared statement" orqali bajariladi: SQL injection imkonsiz.
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { config } = require('./config');
const { hashPassword, sha256, randomToken } = require('./security');

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true, mode: 0o700 });

const db = new Database(config.dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');

/* Baza faylini faqat egasi o'qiy olsin (murojaatlar — shaxsiy ma'lumot) */
function lockDownFiles() {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.chmodSync(config.dbFile + suffix, 0o600); } catch { /* yo'q bo'lsa — muhim emas */ }
  }
}

/* =====================================================================
   SXEMA (migratsiyalar user_version orqali)
   ===================================================================== */
const MIGRATIONS = [
  /* v1 — boshlang'ich sxema */
  () => db.exec(`
    CREATE TABLE tg_users (
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
      tg_id           INTEGER NOT NULL REFERENCES tg_users(tg_id) ON DELETE CASCADE,
      author_name     TEXT,
      author_username TEXT,
      author_phone    TEXT,
      body            TEXT    NOT NULL,
      status          TEXT    NOT NULL DEFAULT 'new',
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL,
      answered_at     INTEGER,
      deleted_at      INTEGER,
      chat_id         INTEGER NOT NULL,
      message_id      INTEGER
    );
    CREATE INDEX appeals_created   ON appeals(deleted_at, created_at DESC);
    CREATE INDEX appeals_status    ON appeals(status, created_at DESC);
    CREATE INDEX appeals_tg        ON appeals(tg_id, created_at DESC);

    CREATE TABLE attachments (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      appeal_id      INTEGER NOT NULL REFERENCES appeals(id) ON DELETE CASCADE,
      kind           TEXT    NOT NULL,
      file_id        TEXT    NOT NULL,
      file_unique_id TEXT,
      file_name      TEXT,
      mime_type      TEXT,
      file_size      INTEGER,
      created_at     INTEGER NOT NULL
    );
    CREATE INDEX attachments_appeal ON attachments(appeal_id);

    CREATE TABLE replies (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      appeal_id      INTEGER NOT NULL REFERENCES appeals(id) ON DELETE CASCADE,
      author         TEXT    NOT NULL,
      via            TEXT    NOT NULL DEFAULT 'panel',
      body           TEXT    NOT NULL,
      created_at     INTEGER NOT NULL,
      delivered      INTEGER NOT NULL DEFAULT 0,
      delivery_error TEXT
    );
    CREATE INDEX replies_appeal ON replies(appeal_id, created_at);

    CREATE TABLE notifications (
      appeal_id  INTEGER NOT NULL REFERENCES appeals(id) ON DELETE CASCADE,
      chat_id    INTEGER NOT NULL,
      message_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (chat_id, message_id)
    );

    CREATE TABLE admins (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      username            TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash       TEXT NOT NULL,
      role                TEXT NOT NULL DEFAULT 'operator',
      totp_secret         TEXT,
      is_disabled         INTEGER NOT NULL DEFAULT 0,
      created_at          INTEGER NOT NULL,
      password_changed_at INTEGER,
      last_login_at       INTEGER
    );

    CREATE TABLE sessions (
      id         TEXT    PRIMARY KEY,
      admin_id   INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
      csrf       TEXT    NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen  INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      ua_hash    TEXT,
      ip_hash    TEXT,
      revoked_at INTEGER
    );
    CREATE INDEX sessions_admin ON sessions(admin_id);

    CREATE TABLE audit_log (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      at      INTEGER NOT NULL,
      actor   TEXT,
      action  TEXT NOT NULL,
      target  TEXT,
      detail  TEXT,
      ip_hash TEXT
    );
    CREATE INDEX audit_at ON audit_log(at DESC);

    CREATE TABLE login_attempts (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      at       INTEGER NOT NULL,
      ip_hash  TEXT,
      username TEXT,
      ok       INTEGER NOT NULL
    );
    CREATE INDEX login_attempts_at ON login_attempts(at DESC);

    CREATE TABLE settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `),

  /* v2 — dekanat ichki izohlari va foydalanuvchiga holat xabarnomasi belgisi */
  () => db.exec(`
    CREATE TABLE notes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      appeal_id  INTEGER NOT NULL REFERENCES appeals(id) ON DELETE CASCADE,
      author     TEXT    NOT NULL,
      body       TEXT    NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX notes_appeal ON notes(appeal_id, created_at);

    ALTER TABLE appeals ADD COLUMN progress_notified_at INTEGER;
  `),

  /* v3 — bitta Telegram xabaridan ikki murojaat yaratilmasligi uchun indeks.
     (UNIQUE emas: eski bazalarda allaqachon dublikat bo'lishi mumkin —
     takrorlanish kodda, tranzaksiya ichida tekshiriladi.) */
  () => db.exec(`
    CREATE INDEX IF NOT EXISTS appeals_message ON appeals(tg_id, chat_id, message_id);
  `),
];

function migrate() {
  const current = db.pragma('user_version', { simple: true });
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      MIGRATIONS[v]();
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
  lockDownFiles();
}
migrate();

const now = () => Date.now();
const STATUSES = ['new', 'in_progress', 'answered', 'closed'];

/* =====================================================================
   SOZLAMALAR (kalit-qiymat)
   ===================================================================== */
const q = {
  getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
  setSetting: db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
                          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`),
};
const getSetting = (key, def = null) => { const row = q.getSetting.get(key); return row ? row.value : def; };
const setSetting = (key, value) => q.setSetting.run(key, String(value), now());

/* =====================================================================
   TELEGRAM FOYDALANUVCHILARI
   ===================================================================== */
const stmtUpsertUser = db.prepare(`
  INSERT INTO tg_users (tg_id, username, first_name, last_name, lang, first_seen, last_seen)
  VALUES (@tg_id, @username, @first_name, @last_name, @lang, @ts, @ts)
  ON CONFLICT(tg_id) DO UPDATE SET
    username = excluded.username, first_name = excluded.first_name,
    last_name = excluded.last_name, lang = excluded.lang, last_seen = excluded.last_seen`);

function upsertUser(user) {
  stmtUpsertUser.run({
    tg_id: user.id,
    username: user.username || null,
    first_name: user.first_name || null,
    last_name: user.last_name || null,
    lang: user.language_code || null,
    ts: now(),
  });
  return getUser(user.id);
}

const stmtGetUser = db.prepare('SELECT * FROM tg_users WHERE tg_id = ?');
const getUser = (tgId) => stmtGetUser.get(tgId);

const stmtSetPhone = db.prepare('UPDATE tg_users SET phone = ? WHERE tg_id = ?');
const setUserPhone = (tgId, phone) => stmtSetPhone.run(phone, tgId);

const stmtBlockUser = db.prepare('UPDATE tg_users SET is_blocked = ?, block_reason = ?, blocked_at = ? WHERE tg_id = ?');
const setUserBlocked = (tgId, blocked, reason = null) =>
  stmtBlockUser.run(blocked ? 1 : 0, blocked ? reason : null, blocked ? now() : null, tgId);

const stmtListUsers = db.prepare(`
  SELECT u.*, (SELECT COUNT(*) FROM appeals a WHERE a.tg_id = u.tg_id AND a.deleted_at IS NULL) AS appeals_count
  FROM tg_users u ORDER BY u.last_seen DESC LIMIT ? OFFSET ?`);
const listUsers = (limit = 50, offset = 0) => stmtListUsers.all(limit, offset);

/* =====================================================================
   MUROJAATLAR (kategoriya yo'q — erkin matn)
   ===================================================================== */
const stmtInsertAppeal = db.prepare(`
  INSERT INTO appeals (code, tg_id, author_name, author_username, author_phone, body, status, created_at, updated_at, chat_id, message_id)
  VALUES (@code, @tg_id, @author_name, @author_username, @author_phone, @body, 'new', @ts, @ts, @chat_id, @message_id)`);
const stmtCountYear = db.prepare("SELECT COUNT(*) AS n FROM appeals WHERE code LIKE ?");

function nextCode(year) {
  const prefix = `MR-${year}-`;
  const n = stmtCountYear.get(prefix + '%').n + 1;
  return prefix + String(n).padStart(4, '0');
}

/** Murojaat yaratish. Kodni UNIQUE to'qnashuvida qayta urinadi. */
const stmtFindByMessage = db.prepare(
  'SELECT * FROM appeals WHERE tg_id = ? AND chat_id = ? AND message_id = ? LIMIT 1');

const createAppeal = db.transaction((data) => {
  /* Telegram update'ni qayta yuborsa (tarmoq uzilishi, timeout), bitta
     xabardan ikkita murojaat yaratilmasligi kerak. */
  if (data.messageId) {
    const existing = stmtFindByMessage.get(data.tgId, data.chatId, data.messageId);
    if (existing) return { ...existing, duplicate: true };
  }
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = attempt === 0 ? nextCode(year) : `MR-${year}-${randomToken(4).slice(0, 5).toUpperCase()}`;
    try {
      const info = stmtInsertAppeal.run({
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
      return getAppeal(Number(info.lastInsertRowid));
    } catch (err) {
      if (!String(err.message).includes('UNIQUE')) throw err;
    }
  }
  throw new Error('Murojaat kodini yaratib bo\'lmadi');
});

const stmtGetAppeal = db.prepare('SELECT * FROM appeals WHERE id = ?');
const getAppeal = (id) => stmtGetAppeal.get(id);

const stmtGetAppealByCode = db.prepare('SELECT * FROM appeals WHERE code = ? COLLATE NOCASE');
const getAppealByCode = (code) => stmtGetAppealByCode.get(String(code).trim());

const stmtRecentAppealOfUser = db.prepare(`
  SELECT * FROM appeals WHERE tg_id = ? AND deleted_at IS NULL AND created_at > ?
  ORDER BY created_at DESC LIMIT 1`);
const getRecentAppealOfUser = (tgId, sinceMs) => stmtRecentAppealOfUser.get(tgId, sinceMs);

const stmtUserAppeals = db.prepare(`
  SELECT * FROM appeals WHERE tg_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ?`);
const listUserAppeals = (tgId, limit = 10) => stmtUserAppeals.all(tgId, limit);

const stmtCountSince = db.prepare('SELECT COUNT(*) AS n FROM appeals WHERE tg_id = ? AND created_at > ?');
const countAppealsSince = (tgId, sinceMs) => stmtCountSince.get(tgId, sinceMs).n;

const stmtLastAppealAt = db.prepare('SELECT created_at FROM appeals WHERE tg_id = ? ORDER BY created_at DESC LIMIT 1');
const lastAppealAt = (tgId) => stmtLastAppealAt.get(tgId)?.created_at || 0;

/* "Javob berilgan" sanasi faqat shu holatda saqlanadi; holat orqaga
   qaytarilsa tozalanadi — aks holda "Yangi" murojaatda javob sanasi ko'rinadi. */
const stmtSetStatus = db.prepare(`
  UPDATE appeals SET status = @status, updated_at = @ts,
    answered_at = CASE WHEN @status IN ('answered','closed') THEN COALESCE(answered_at, @answeredAt) ELSE NULL END
  WHERE id = @id`);
function setAppealStatus(id, status) {
  if (!STATUSES.includes(status)) throw new Error('Noto\'g\'ri status');
  const ts = now();
  stmtSetStatus.run({ status, ts, answeredAt: status === 'answered' ? ts : null, id });
  return getAppeal(id);
}

const stmtTouchAppeal = db.prepare('UPDATE appeals SET updated_at = ? WHERE id = ?');
const touchAppeal = (id) => stmtTouchAppeal.run(now(), id);

const stmtSoftDelete = db.prepare('UPDATE appeals SET deleted_at = ?, updated_at = ? WHERE id = ?');
const softDeleteAppeal = (id) => { const ts = now(); stmtSoftDelete.run(ts, ts, id); };

const stmtRestore = db.prepare('UPDATE appeals SET deleted_at = NULL, updated_at = ? WHERE id = ?');
const restoreAppeal = (id) => stmtRestore.run(now(), id);

const stmtSetAppealPhone = db.prepare('UPDATE appeals SET author_phone = ? WHERE id = ? AND author_phone IS NULL');
const setAppealPhone = (id, phone) => stmtSetAppealPhone.run(phone, id);

/**
 * Murojaatlar ro'yxati — filtr, qidiruv va sahifalash bilan.
 * Qidiruv LIKE orqali; parametrlar bog'langan (injection yo'q).
 */
function listAppeals({ status = '', search = '', limit = 25, offset = 0, includeDeleted = false,
                      from = null, to = null, overdue = null } = {}) {
  const where = [];
  const params = {};
  if (!includeDeleted) where.push('a.deleted_at IS NULL');
  if (status && STATUSES.includes(status)) { where.push('a.status = @status'); params.status = status; }
  if (search) {
    /* ESCAPE '\\' bo'lmasa, % va _ belgilari SQLite'da joker sifatida ishlaydi */
    where.push(`(a.body LIKE @like ESCAPE '\\' OR a.code LIKE @like ESCAPE '\\'
                 OR a.author_name LIKE @like ESCAPE '\\' OR a.author_username LIKE @like ESCAPE '\\'
                 OR a.author_phone LIKE @like ESCAPE '\\' OR CAST(a.tg_id AS TEXT) = @exact)`);
    params.like = '%' + String(search).replace(/[%_\\]/g, (m) => '\\' + m) + '%';
    params.exact = String(search).trim();
  }
  if (Number.isFinite(from)) { where.push('a.created_at >= @from'); params.from = from; }
  if (Number.isFinite(to)) { where.push('a.created_at <= @to'); params.to = to; }
  if (overdue) {
    where.push("a.status IN ('new','in_progress') AND a.created_at < @overdueBefore");
    params.overdueBefore = overdue;
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM appeals a ${whereSql}`).get(params).n;
  const rows = db.prepare(`
    SELECT a.*,
           (SELECT COUNT(*) FROM attachments t WHERE t.appeal_id = a.id) AS attachments_count,
           (SELECT COUNT(*) FROM replies r WHERE r.appeal_id = a.id)     AS replies_count,
           (SELECT COUNT(*) FROM notes n WHERE n.appeal_id = a.id)       AS notes_count,
           u.is_blocked AS author_blocked
    FROM appeals a LEFT JOIN tg_users u ON u.tg_id = a.tg_id
    ${whereSql}
    ORDER BY a.created_at DESC
    LIMIT @limit OFFSET @offset`).all({ ...params, limit, offset });
  return { total, rows };
}

function stats(slaMs = 48 * 3600_000) {
  const dayAgo = now() - 24 * 3600_000;
  const base = db.prepare(`SELECT
      COUNT(*) AS total,
      SUM(status = 'new')         AS new_count,
      SUM(status = 'in_progress') AS in_progress,
      SUM(status = 'answered')    AS answered,
      SUM(status = 'closed')      AS closed,
      SUM(created_at > ?)         AS last_24h
    FROM appeals WHERE deleted_at IS NULL`).get(dayAgo);
  const authors = db.prepare('SELECT COUNT(DISTINCT tg_id) AS n FROM appeals WHERE deleted_at IS NULL').get().n;
  const blocked = db.prepare('SELECT COUNT(*) AS n FROM tg_users WHERE is_blocked = 1').get().n;
  const overdue = db.prepare(`SELECT COUNT(*) AS n FROM appeals
    WHERE deleted_at IS NULL AND status IN ('new','in_progress') AND created_at < ?`).get(now() - slaMs).n;
  return {
    total: base.total || 0,
    new: base.new_count || 0,
    inProgress: base.in_progress || 0,
    answered: base.answered || 0,
    closed: base.closed || 0,
    last24h: base.last_24h || 0,
    overdue,
    authors,
    blocked,
  };
}

/* =====================================================================
   ILOVALAR (fayllar) — faqat Telegram file_id saqlanadi, fayl emas
   ===================================================================== */
const stmtAddAttachment = db.prepare(`
  INSERT INTO attachments (appeal_id, kind, file_id, file_unique_id, file_name, mime_type, file_size, created_at)
  VALUES (@appeal_id, @kind, @file_id, @file_unique_id, @file_name, @mime_type, @file_size, @ts)`);
function addAttachment(appealId, att) {
  const info = stmtAddAttachment.run({
    appeal_id: appealId,
    kind: att.kind,
    file_id: att.fileId,
    file_unique_id: att.fileUniqueId || null,
    file_name: att.fileName || null,
    mime_type: att.mimeType || null,
    file_size: att.fileSize || null,
    ts: now(),
  });
  return Number(info.lastInsertRowid);
}

const stmtListAttachments = db.prepare('SELECT * FROM attachments WHERE appeal_id = ? ORDER BY id');
const listAttachments = (appealId) => stmtListAttachments.all(appealId);

const stmtGetAttachment = db.prepare('SELECT * FROM attachments WHERE id = ?');
const getAttachment = (id) => stmtGetAttachment.get(id);

const stmtCountAttachments = db.prepare('SELECT COUNT(*) AS n FROM attachments WHERE appeal_id = ?');
const countAttachments = (appealId) => stmtCountAttachments.get(appealId).n;

/* =====================================================================
   ICHKI IZOHLAR (foydalanuvchiga YUBORILMAYDI — faqat dekanat ko'radi)
   ===================================================================== */
const stmtAddNote = db.prepare('INSERT INTO notes (appeal_id, author, body, created_at) VALUES (?, ?, ?, ?)');
function addNote(appealId, { author, body }) {
  const info = stmtAddNote.run(appealId, author, body, now());
  return Number(info.lastInsertRowid);
}

const stmtListNotes = db.prepare('SELECT * FROM notes WHERE appeal_id = ? ORDER BY created_at');
const listNotes = (appealId) => stmtListNotes.all(appealId);

/* =====================================================================
   NAZORAT: javobsiz qolgan (kechikkan) murojaatlar
   ===================================================================== */
const stmtOverdue = db.prepare(`
  SELECT * FROM appeals
  WHERE deleted_at IS NULL AND status IN ('new','in_progress') AND created_at < ?
  ORDER BY created_at LIMIT ?`);
const listOverdueAppeals = (slaMs, limit = 20) => stmtOverdue.all(now() - slaMs, limit);

const stmtCountUserAppeals = db.prepare('SELECT COUNT(*) AS n FROM appeals WHERE tg_id = ? AND deleted_at IS NULL');
const countUserAppeals = (tgId) => stmtCountUserAppeals.get(tgId).n;

const stmtMarkProgressNotified = db.prepare('UPDATE appeals SET progress_notified_at = ? WHERE id = ?');
const markProgressNotified = (id) => stmtMarkProgressNotified.run(now(), id);

/* =====================================================================
   JAVOBLAR
   ===================================================================== */
const stmtAddReply = db.prepare(`
  INSERT INTO replies (appeal_id, author, via, body, created_at, delivered, delivery_error)
  VALUES (@appeal_id, @author, @via, @body, @ts, 0, NULL)`);
function addReply(appealId, { author, body, via = 'panel' }) {
  const info = stmtAddReply.run({ appeal_id: appealId, author, via, body, ts: now() });
  return Number(info.lastInsertRowid);
}

const stmtMarkDelivered = db.prepare('UPDATE replies SET delivered = ?, delivery_error = ? WHERE id = ?');
const markReplyDelivered = (id, ok, error = null) => stmtMarkDelivered.run(ok ? 1 : 0, ok ? null : String(error || '').slice(0, 300), id);

const stmtListReplies = db.prepare('SELECT * FROM replies WHERE appeal_id = ? ORDER BY created_at');
const listReplies = (appealId) => stmtListReplies.all(appealId);

/* =====================================================================
   TELEGRAM XABARNOMALARI (dekan to'g'ridan-to'g'ri "reply" qila olishi uchun)
   ===================================================================== */
const stmtAddNotification = db.prepare(`
  INSERT OR REPLACE INTO notifications (appeal_id, chat_id, message_id, created_at) VALUES (?, ?, ?, ?)`);
const addNotification = (appealId, chatId, messageId) => stmtAddNotification.run(appealId, chatId, messageId, now());

const stmtFindNotification = db.prepare('SELECT * FROM notifications WHERE chat_id = ? AND message_id = ?');
const findNotification = (chatId, messageId) => stmtFindNotification.get(chatId, messageId);

/* =====================================================================
   ADMINLAR
   ===================================================================== */
const stmtGetAdminByName = db.prepare('SELECT * FROM admins WHERE username = ? COLLATE NOCASE');
const getAdminByUsername = (username) => stmtGetAdminByName.get(String(username || '').trim());

const stmtGetAdmin = db.prepare('SELECT * FROM admins WHERE id = ?');
const getAdmin = (id) => stmtGetAdmin.get(id);

const stmtListAdmins = db.prepare('SELECT id, username, role, is_disabled, created_at, last_login_at, password_changed_at, (totp_secret IS NOT NULL) AS totp_enabled FROM admins ORDER BY id');
const listAdmins = () => stmtListAdmins.all();

const stmtCreateAdmin = db.prepare(`
  INSERT INTO admins (username, password_hash, role, created_at, password_changed_at)
  VALUES (?, ?, ?, ?, ?)`);
function createAdmin({ username, password, role = 'operator' }) {
  const info = stmtCreateAdmin.run(String(username).trim(), hashPassword(password), role === 'owner' ? 'owner' : 'operator', now(), now());
  return getAdmin(Number(info.lastInsertRowid));
}

const stmtSetAdminPassword = db.prepare('UPDATE admins SET password_hash = ?, password_changed_at = ? WHERE id = ?');
const setAdminPassword = (id, password) => stmtSetAdminPassword.run(hashPassword(password), now(), id);

const stmtSetAdminDisabled = db.prepare('UPDATE admins SET is_disabled = ? WHERE id = ?');
const setAdminDisabled = (id, disabled) => stmtSetAdminDisabled.run(disabled ? 1 : 0, id);

const stmtSetAdminTotp = db.prepare('UPDATE admins SET totp_secret = ? WHERE id = ?');
const setAdminTotp = (id, secret) => stmtSetAdminTotp.run(secret || null, id);

const stmtTouchLogin = db.prepare('UPDATE admins SET last_login_at = ? WHERE id = ?');
const touchAdminLogin = (id) => stmtTouchLogin.run(now(), id);

const stmtDeleteAdmin = db.prepare('DELETE FROM admins WHERE id = ?');
const deleteAdmin = (id) => stmtDeleteAdmin.run(id);

const stmtCountAdmins = db.prepare('SELECT COUNT(*) AS n FROM admins');
const countAdmins = () => stmtCountAdmins.get().n;

/** Birinchi ishga tushishda egani (owner) env'dan yaratamiz. */
function ensureOwner() {
  if (countAdmins() > 0) return null;
  const username = config.adminUsername || 'admin';
  const hash = config.adminPasswordHash || (config.adminPassword ? hashPassword(config.adminPassword) : null);
  if (!hash) return null;
  const info = stmtCreateAdmin.run(username, hash, 'owner', now(), now());
  return getAdmin(Number(info.lastInsertRowid));
}

/* =====================================================================
   SESSIYALAR (bazada — har qanday vaqtda bekor qilish mumkin)
   ===================================================================== */
const stmtCreateSession = db.prepare(`
  INSERT INTO sessions (id, admin_id, csrf, created_at, last_seen, expires_at, ua_hash, ip_hash)
  VALUES (@id, @admin_id, @csrf, @ts, @ts, @expires_at, @ua_hash, @ip_hash)`);
function createSession({ tokenHash, adminId, csrf, expiresAt, uaHash, ipHash }) {
  stmtCreateSession.run({
    id: tokenHash, admin_id: adminId, csrf, ts: now(), expires_at: expiresAt, ua_hash: uaHash || null, ip_hash: ipHash || null,
  });
}

const stmtGetSession = db.prepare(`
  SELECT s.*, a.username, a.role, a.is_disabled
  FROM sessions s JOIN admins a ON a.id = s.admin_id
  WHERE s.id = ? AND s.revoked_at IS NULL`);
const getSession = (tokenHash) => stmtGetSession.get(tokenHash);

const stmtTouchSession = db.prepare('UPDATE sessions SET last_seen = ? WHERE id = ?');
const touchSession = (tokenHash) => stmtTouchSession.run(now(), tokenHash);

const stmtRevokeSession = db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL');
const revokeSession = (tokenHash) => stmtRevokeSession.run(now(), tokenHash);

const stmtRevokeAdminSessions = db.prepare('UPDATE sessions SET revoked_at = ? WHERE admin_id = ? AND revoked_at IS NULL');
const revokeAdminSessions = (adminId) => stmtRevokeAdminSessions.run(now(), adminId);

const stmtPurgeSessions = db.prepare('DELETE FROM sessions WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)');
const purgeSessions = () => stmtPurgeSessions.run(now(), now() - 7 * 24 * 3600_000);

/* =====================================================================
   AUDIT VA KIRISH URINISHLARI
   ===================================================================== */
const stmtAudit = db.prepare('INSERT INTO audit_log (at, actor, action, target, detail, ip_hash) VALUES (?, ?, ?, ?, ?, ?)');
const audit = (actor, action, target = null, detail = null, ipHash = null) =>
  stmtAudit.run(now(), actor, action, target === null ? null : String(target), detail === null ? null : String(detail).slice(0, 500), ipHash);

const stmtListAudit = db.prepare('SELECT * FROM audit_log ORDER BY at DESC LIMIT ? OFFSET ?');
const listAudit = (limit = 100, offset = 0) => stmtListAudit.all(limit, offset);

const stmtLoginAttempt = db.prepare('INSERT INTO login_attempts (at, ip_hash, username, ok) VALUES (?, ?, ?, ?)');
const recordLoginAttempt = (ipHash, username, ok) => stmtLoginAttempt.run(now(), ipHash, String(username || '').slice(0, 64), ok ? 1 : 0);

const stmtFailedAttempts = db.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE ip_hash = ? AND ok = 0 AND at > ?');
const countFailedAttempts = (ipHash, sinceMs) => stmtFailedAttempts.get(ipHash, sinceMs).n;

const stmtFailedForUser = db.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE username = ? AND ok = 0 AND at > ?');
const countFailedForUser = (username, sinceMs) => stmtFailedForUser.get(String(username || '').slice(0, 64), sinceMs).n;

const stmtPurgeAttempts = db.prepare('DELETE FROM login_attempts WHERE at < ?');
const stmtPurgeAudit = db.prepare('DELETE FROM audit_log WHERE at < ?');
function purgeOld() {
  stmtPurgeAttempts.run(now() - 30 * 24 * 3600_000);
  stmtPurgeAudit.run(now() - 365 * 24 * 3600_000);
  purgeSessions();
}

function close() { try { db.close(); } catch { /* allaqachon yopilgan */ } }

module.exports = {
  db, STATUSES, lockDownFiles,
  getSetting, setSetting,
  upsertUser, getUser, setUserPhone, setUserBlocked, listUsers,
  createAppeal, getAppeal, getAppealByCode, getRecentAppealOfUser, listUserAppeals,
  countAppealsSince, lastAppealAt, setAppealStatus, touchAppeal, softDeleteAppeal, restoreAppeal,
  setAppealPhone, listAppeals, stats,
  addAttachment, listAttachments, getAttachment, countAttachments,
  addReply, markReplyDelivered, listReplies,
  addNote, listNotes, listOverdueAppeals, countUserAppeals, markProgressNotified,
  addNotification, findNotification,
  getAdminByUsername, getAdmin, listAdmins, createAdmin, setAdminPassword, setAdminDisabled,
  setAdminTotp, touchAdminLogin, deleteAdmin, countAdmins, ensureOwner,
  createSession, getSession, touchSession, revokeSession, revokeAdminSessions, purgeSessions,
  audit, listAudit, recordLoginAttempt, countFailedAttempts, countFailedForUser, purgeOld,
  close,
};
