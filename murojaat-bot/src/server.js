'use strict';
/* =====================================================================
   ADMIN PANEL SERVERI (Express)
   Xavfsizlik: qat'iy HTTP sarlavhalar (CSP), bazadagi sessiyalar,
   CSRF tokeni, Origin tekshiruvi, kirish urinishlarini cheklash,
   barcha harakatlar audit jurnalida.
   ===================================================================== */
const path = require('path');
const express = require('express');
const { webhookCallback } = require('grammy');
const { Readable } = require('stream');

const { config } = require('./config');
const db = require('./db');
const log = require('./logger');
const { bot, deliverReply, getFilePath, notifyAuthorInProgress, sendDailyDigest } = require('./bot');
const {
  verifyPassword, hashPassword, verifyPasswordAsync, hashPasswordAsync, verifyTotp,
  safeEqual, randomToken, sha256, keyedHash,
  generateTotpSecret, RateLimiter, serializeCookie, parseCookies, sanitizeText,
} = require('./security');

/* "Foydalanuvchi topilmadi" holatida ham bir xil vaqt ketishi uchun soxta hash.
   Bir marta hisoblanadi — har so'rovda qayta hisoblash serverni sekinlashtiradi. */
const DUMMY_HASH = hashPassword('dummy-password-for-timing');

const COOKIE_NAME = config.requireHttps ? '__Host-mb_session' : 'mb_session';
const SESSION_TTL_MS = config.sessionTtlHours * 3600_000;
const SESSION_IDLE_MS = config.sessionIdleMinutes * 60_000;

/* So'rov chegaralari */
const loginLimiter = new RateLimiter({ windowMs: config.loginWindowMinutes * 60_000, max: config.loginMaxAttempts, name: 'login' });
const apiLimiter = new RateLimiter({ windowMs: 60_000, max: 300, name: 'api' });
const writeLimiter = new RateLimiter({ windowMs: 60_000, max: 60, name: 'write' });

/* ---- Yordamchilar ---- */
const clientIp = (req) => req.ip || req.socket?.remoteAddress || '0.0.0.0';
const ipHash = (req) => keyedHash(clientIp(req), config.sessionSecret);
const uaHash = (req) => keyedHash(req.headers['user-agent'] || '', config.sessionSecret);
const toInt = (value, def = 0) => { const n = Number.parseInt(value, 10); return Number.isFinite(n) ? n : def; };
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function fail(res, status, code, message) {
  return res.status(status).json({ error: code, message });
}

/* =====================================================================
   SESSIYA
   ===================================================================== */
function issueSession(res, admin, req) {
  const token = randomToken(32);
  const csrf = randomToken(24);
  db.createSession({
    tokenHash: sha256(token),
    adminId: admin.id,
    csrf,
    expiresAt: Date.now() + SESSION_TTL_MS,
    uaHash: uaHash(req),
    ipHash: ipHash(req),
  });
  res.setHeader('Set-Cookie', serializeCookie(COOKIE_NAME, token, {
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    secure: config.requireHttps,
    sameSite: 'Strict',
  }));
  return csrf;
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', serializeCookie(COOKIE_NAME, '', { maxAge: 0, secure: config.requireHttps, sameSite: 'Strict' }));
}

function readSession(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!token) return null;
  const tokenHash = sha256(token);
  const session = db.getSession(tokenHash);
  if (!session) return null;

  const now = Date.now();
  const invalid =
    session.is_disabled ||
    session.expires_at < now ||
    now - session.last_seen > SESSION_IDLE_MS ||
    (session.ua_hash && !safeEqual(session.ua_hash, uaHash(req)));   // brauzer o'zgarsa — sessiya bekor

  if (invalid) {
    db.revokeSession(tokenHash);
    return null;
  }
  db.touchSession(tokenHash);
  return { ...session, tokenHash };
}

function requireAuth(req, res, next) {
  const session = readSession(req);
  if (!session) {
    clearSessionCookie(res);
    return fail(res, 401, 'unauthorized', 'Sessiya tugagan — qaytadan kiring.');
  }
  req.session = session;
  req.actor = session.username;
  next();
}

const requireOwner = (req, res, next) =>
  req.session?.role === 'owner' ? next() : fail(res, 403, 'forbidden', 'Bu amal faqat egasi (owner) uchun.');

/* CSRF + Origin: o'zgartiruvchi so'rovlar uchun majburiy */
function requireCsrf(req, res, next) {
  const origin = req.headers.origin;
  if (origin) {
    let originHost = null;
    try { originHost = new URL(origin).host; } catch { /* buzuq Origin */ }
    const expected = config.publicUrl ? new URL(config.publicUrl).host : req.headers.host;
    if (!originHost || !safeEqual(originHost, expected)) {
      return fail(res, 403, 'bad_origin', 'So\'rov manbasi noto\'g\'ri.');
    }
  }
  const header = req.headers['x-csrf-token'];
  if (!req.session || !header || !safeEqual(header, req.session.csrf)) {
    return fail(res, 403, 'bad_csrf', 'CSRF tokeni yaroqsiz — sahifani yangilang.');
  }
  if (!writeLimiter.check('w:' + req.session.admin_id).allowed) {
    return fail(res, 429, 'rate_limited', 'Juda ko\'p so\'rov. Bir ozdan keyin urinib ko\'ring.');
  }
  next();
}

/* =====================================================================
   ILOVA
   ===================================================================== */
function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false);
  if (config.trustProxy) app.set('trust proxy', /^\d+$/.test(config.trustProxy) ? Number(config.trustProxy) : config.trustProxy);

  /* --- Holat tekshiruvi: HTTPS yo'naltirishidan OLDIN turadi, aks holda
         Docker/monitoring tekshiruvi 308 redirect sababli doim yiqiladi --- */
  app.get(['/healthz', '/api/health'], (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.json({ ok: true, mode: config.botMode, time: new Date().toISOString() });
  });

  /* --- Xavfsizlik sarlavhalari + HTTPS majburiyligi --- */
  app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', [
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "font-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join('; '));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');

    /* req.protocol X-Forwarded-Proto'ni FAQAT ishonchli proksidan (trust proxy)
       kelganda hisobga oladi — shuning uchun sarlavhani o'zimiz o'qimaymiz. */
    const proto = req.protocol;
    if (config.requireHttps) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      if (proto !== 'https' && req.method === 'GET') {
        return res.redirect(308, 'https://' + req.headers.host + req.originalUrl);
      }
      if (proto !== 'https') return fail(res, 400, 'https_required', 'Faqat HTTPS orqali ishlaydi.');
    }
    next();
  });

  /* --- Telegram webhook (maxfiy yo'l + maxfiy sarlavha) --- */
  if (config.botMode === 'webhook') {
    app.post(config.webhookPath,
      express.json({ limit: '1mb' }),
      webhookCallback(bot, 'express', { secretToken: config.webhookSecret, timeoutMilliseconds: 25_000, onTimeout: 'return' }));
    log.info('webhook yo\'li tayyor', { path: config.webhookPath });
  }

  /* --- API: umumiy chegara va keshsizlik --- */
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!apiLimiter.check('ip:' + clientIp(req)).allowed) {
      return fail(res, 429, 'rate_limited', 'Juda ko\'p so\'rov.');
    }
    next();
  });
  app.use('/api', express.json({ limit: '64kb' }));

  /* Kirish sahifasi uchun ochiq ma'lumot (maxfiy emas: fakultet va dekan nomi) */
  app.get('/api/office', (req, res) => {
    res.json({
      faculty: config.facultyName,
      dean: config.deanName,
      deanTitle: config.deanTitle,
      hours: config.officeHours,
    });
  });

  /* =====================================================================
     KIRISH / CHIQISH
     ===================================================================== */
  app.post('/api/login', async (req, res) => {
    const ip = ipHash(req);
    /* Login registrga sezgir emas (COLLATE NOCASE) — qulflash hisoblagichlari
       ham bir xil kalitni ko'rishi uchun kichik harfga keltiramiz (sec-02). */
    const username = sanitizeText(req.body?.username, 64).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const totp = sanitizeText(req.body?.totp, 8);

    /* IP va login bo'yicha qulflash (brute-force himoyasi) */
    const windowStart = Date.now() - config.loginWindowMinutes * 60_000;
    const lockedByIp = db.countFailedAttempts(ip, windowStart) >= config.loginMaxAttempts;
    /* Hisob darajasidagi qulf faqat KO'P TURLI IP'dan hujum bo'lganda ishlaydi —
       aks holda bitta hujumchi adminni panelga kirита olmaydigan qilib qo'yadi. */
    const lockedByUser = db.countFailedIpsForUser(username, windowStart) >= 5 &&
      db.countFailedForUser(username, windowStart) >= config.loginMaxAttempts * 2;

    if (!loginLimiter.check('login:' + ip).allowed || lockedByIp || lockedByUser) {
      /* DIQQAT: qulflangan so'rovni yangi "xato urinish" sifatida YOZMAYMIZ —
         aks holda hujumchi oynani cheksiz uzaytirib, qulfni abadiy ushlab turadi. */
      log.warn('kirish qulflandi', { ip_hash: ip, username, by: lockedByIp ? 'ip' : 'hisob' });
      return fail(res, 429, 'locked', `Juda ko'p urinish. ${config.loginWindowMinutes} daqiqadan keyin qayta urinib ko'ring.`);
    }

    const admin = db.getAdminByUsername(username);
    /* Asinxron: scrypt hisoblanayotganda server boshqa so'rovlarga javob bera oladi */
    const okPassword = await verifyPasswordAsync(password, admin ? admin.password_hash : DUMMY_HASH);

    if (!admin || admin.is_disabled || !okPassword) {
      db.recordLoginAttempt(ip, username, false);
      db.audit(username || '—', 'login_failed', null, admin ? 'parol xato' : 'foydalanuvchi topilmadi', ip);
      return fail(res, 401, 'bad_credentials', 'Login yoki parol xato.');
    }
    if (admin.totp_secret && !verifyTotp(admin.totp_secret, totp)) {
      db.recordLoginAttempt(ip, username, false);
      db.audit(admin.username, 'login_failed', null, '2FA kodi xato', ip);
      return fail(res, 401, 'bad_totp', 'Ikki qadamli tasdiqlash kodi xato.');
    }

    db.recordLoginAttempt(ip, username, true);
    db.touchAdminLogin(admin.id);
    const csrf = issueSession(res, admin, req);
    db.audit(admin.username, 'login', null, null, ip);
    loginLimiter.reset('login:' + ip);
    res.json({ ok: true, user: { username: admin.username, role: admin.role, totpEnabled: !!admin.totp_secret }, csrf });
  });

  app.post('/api/logout', requireAuth, (req, res) => {
    db.revokeSession(req.session.tokenHash);
    db.audit(req.actor, 'logout', null, null, ipHash(req));
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.get('/api/me', requireAuth, (req, res) => {
    res.json({
      user: { username: req.session.username, role: req.session.role },
      csrf: req.session.csrf,
      office: {
        faculty: config.facultyName,
        dean: config.deanName,
        deanTitle: config.deanTitle,
        hours: config.officeHours,
      },
      limits: {
        appealMinLength: config.appealMinLength,
        appealMaxLength: config.appealMaxLength,
        slaHours: config.slaHours,
      },
      totpEnabled: !!db.getAdmin(req.session.admin_id)?.totp_secret,
    });
  });

  app.post('/api/password', requireAuth, requireCsrf, async (req, res) => {
    const current = String(req.body?.current || '');
    const next = String(req.body?.next || '');
    const admin = db.getAdmin(req.session.admin_id);
    if (!await verifyPasswordAsync(current, admin.password_hash)) {
      db.audit(req.actor, 'password_change_failed', null, null, ipHash(req));
      return fail(res, 401, 'bad_credentials', 'Hozirgi parol xato.');
    }
    if (next.length < 12) return fail(res, 400, 'weak_password', 'Yangi parol kamida 12 belgi bo\'lishi kerak.');
    if (next === current) return fail(res, 400, 'same_password', 'Yangi parol eskisidan farq qilishi kerak.');

    db.setAdminPassword(admin.id, await hashPasswordAsync(next));
    db.revokeAdminSessions(admin.id);          // barcha qurilmalardan chiqarish
    db.audit(req.actor, 'password_changed', null, null, ipHash(req));
    clearSessionCookie(res);
    res.json({ ok: true, message: 'Parol o\'zgartirildi — qaytadan kiring.' });
  });

  /* =====================================================================
     MUROJAATLAR
     ===================================================================== */
  app.get('/api/stats', requireAuth, (req, res) => res.json(db.stats(config.slaHours * 3600_000)));

  app.get('/api/appeals', requireAuth, (req, res) => {
    const limit = clamp(toInt(req.query.limit, 25), 1, 100);
    const offset = clamp(toInt(req.query.offset, 0), 0, 1_000_000);
    const { total, rows } = db.listAppeals({ ...appealFilters(req), limit, offset });
    res.json({ total, limit, offset, rows: rows.map(publicAppeal) });
  });

  app.get('/api/appeals/:id', requireAuth, (req, res) => {
    const appeal = db.getAppeal(toInt(req.params.id, -1));
    if (!appeal) return fail(res, 404, 'not_found', 'Murojaat topilmadi.');
    /* O'chirilgan (arxivlangan) murojaatni faqat owner ko'radi */
    if (appeal.deleted_at && req.session.role !== 'owner') {
      return fail(res, 404, 'not_found', 'Murojaat topilmadi.');
    }
    const author = db.getUser(appeal.tg_id);
    res.json({
      appeal: publicAppeal(appeal),
      author: author ? {
        tgId: author.tg_id, username: author.username, phone: author.phone,
        name: [author.first_name, author.last_name].filter(Boolean).join(' '),
        isBlocked: !!author.is_blocked, blockReason: author.block_reason,
        firstSeen: author.first_seen, lastSeen: author.last_seen,
        appeals: db.countUserAppeals(appeal.tg_id),
      } : null,
      /* Shu odamning oldingi murojaatlari — takroriy masalani darhol ko'rish uchun */
      authorHistory: db.listUserAppeals(appeal.tg_id, 6)
        .filter((row) => row.id !== appeal.id)
        .map((row) => ({ id: row.id, code: row.code, status: row.status, createdAt: row.created_at, body: row.body.slice(0, 90) })),
      notes: db.listNotes(appeal.id).map((n) => ({ id: n.id, author: n.author, body: n.body, createdAt: n.created_at })),
      attachments: db.listAttachments(appeal.id).map((a) => ({
        id: a.id, kind: a.kind, fileName: a.file_name, mimeType: a.mime_type, fileSize: a.file_size, createdAt: a.created_at,
      })),
      replies: db.listReplies(appeal.id).map((r) => ({
        id: r.id, author: r.author, via: r.via, body: r.body, createdAt: r.created_at,
        delivered: !!r.delivered, deliveryError: r.delivery_error,
      })),
    });
  });

  app.post('/api/appeals/:id/status', requireAuth, requireCsrf, (req, res) => {
    const appeal = db.getAppeal(toInt(req.params.id, -1));
    if (!appeal) return fail(res, 404, 'not_found', 'Murojaat topilmadi.');
    if (appeal.deleted_at) return fail(res, 400, 'deleted', 'O\'chirilgan murojaat holati o\'zgartirilmaydi. Avval tiklang.');
    const status = String(req.body?.status || '');
    if (!db.STATUSES.includes(status)) return fail(res, 400, 'bad_status', 'Holat qiymati noto\'g\'ri.');
    const updated = db.setAppealStatus(appeal.id, status);
    db.audit(req.actor, 'status', appeal.code, status, ipHash(req));
    /* "Ko'rib chiqilmoqda"ga o'tganda muallifni bir marta xabardor qilamiz (fon rejimida) */
    if (status === 'in_progress' && !appeal.progress_notified_at && !appeal.deleted_at) {
      notifyAuthorInProgress(updated).catch(() => { /* bot xatosi javobni to'xtatmasin */ });
    }
    res.json({ ok: true, appeal: publicAppeal(updated) });
  });

  app.post('/api/appeals/:id/reply', requireAuth, requireCsrf, async (req, res) => {
    const appeal = db.getAppeal(toInt(req.params.id, -1));
    if (!appeal) return fail(res, 404, 'not_found', 'Murojaat topilmadi.');
    if (appeal.deleted_at) return fail(res, 400, 'deleted', 'O\'chirilgan murojaatga javob yozilmaydi.');

    const body = sanitizeText(req.body?.body, 3500);
    if (body.length < 2) return fail(res, 400, 'empty', 'Javob matni bo\'sh.');

    const result = await deliverReply(appeal, body, { author: req.actor, via: 'panel' });
    db.audit(req.actor, 'reply', appeal.code, result.ok ? 'yetkazildi' : 'xato: ' + result.error, ipHash(req));
    if (!result.ok) {
      return res.status(502).json({
        error: 'delivery_failed',
        message: 'Javob saqlandi, lekin Telegram orqali yetkazilmadi: ' + result.error,
        replyId: result.replyId,
      });
    }
    res.json({ ok: true, appeal: publicAppeal(db.getAppeal(appeal.id)) });
  });

  /* Ichki izoh — foydalanuvchiga YUBORILMAYDI, faqat dekanat ko'radi */
  app.post('/api/appeals/:id/notes', requireAuth, requireCsrf, (req, res) => {
    const appeal = db.getAppeal(toInt(req.params.id, -1));
    if (!appeal || (appeal.deleted_at && req.session.role !== 'owner')) {
      return fail(res, 404, 'not_found', 'Murojaat topilmadi.');
    }
    const body = sanitizeText(req.body?.body, 2000);
    if (body.length < 2) return fail(res, 400, 'empty', 'Izoh matni bo\'sh.');
    const id = db.addNote(appeal.id, { author: req.actor, body });
    db.touchAppeal(appeal.id);
    db.audit(req.actor, 'note', appeal.code, body.slice(0, 120), ipHash(req));
    res.json({ ok: true, note: { id, author: req.actor, body, createdAt: Date.now() } });
  });

  app.post('/api/appeals/:id/delete', requireAuth, requireCsrf, requireOwner, (req, res) => {
    const appeal = db.getAppeal(toInt(req.params.id, -1));
    if (!appeal) return fail(res, 404, 'not_found', 'Murojaat topilmadi.');
    db.softDeleteAppeal(appeal.id);
    db.audit(req.actor, 'appeal_deleted', appeal.code, null, ipHash(req));
    res.json({ ok: true });
  });

  app.post('/api/appeals/:id/restore', requireAuth, requireCsrf, requireOwner, (req, res) => {
    const appeal = db.getAppeal(toInt(req.params.id, -1));
    if (!appeal) return fail(res, 404, 'not_found', 'Murojaat topilmadi.');
    db.restoreAppeal(appeal.id);
    db.audit(req.actor, 'appeal_restored', appeal.code, null, ipHash(req));
    res.json({ ok: true });
  });

  /* --- Ilovani yuklab olish: fayl Telegram'dan server orqali olinadi,
         bot tokeni brauzerga hech qachon chiqmaydi --- */
  app.get('/api/attachments/:id', requireAuth, async (req, res) => {
    const attachment = db.getAttachment(toInt(req.params.id, -1));
    if (!attachment) return fail(res, 404, 'not_found', 'Fayl topilmadi.');
    /* Arxivlangan murojaatning fayli ham faqat owner uchun ochiq bo'lishi kerak */
    const parent = db.getAppeal(attachment.appeal_id);
    if (!parent || (parent.deleted_at && req.session.role !== 'owner')) {
      return fail(res, 404, 'not_found', 'Fayl topilmadi.');
    }
    try {
      const filePath = await getFilePath(attachment.file_id);
      const url = `${config.botApiRoot}/file/bot${config.botToken}/${filePath}`;
      const upstream = await fetch(url);
      if (!upstream.ok || !upstream.body) throw new Error('Telegram javobi: ' + upstream.status);

      const safeName = (attachment.file_name || 'fayl').replace(/[^\w.\- ]+/g, '_').slice(0, 100);
      res.setHeader('Content-Type', 'application/octet-stream');   // brauzerda bajarilmasligi uchun
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      res.setHeader('X-Attachment-Kind', attachment.kind);
      /* Hajmni Telegram javobidan olamiz — bazadagi qiymat eskirgan bo'lishi mumkin */
      const upstreamLength = upstream.headers.get('content-length');
      if (upstreamLength) res.setHeader('Content-Length', upstreamLength);
      db.audit(req.actor, 'attachment_download', attachment.id, safeName, ipHash(req));
      Readable.fromWeb(upstream.body).pipe(res);
    } catch (err) {
      log.warn('faylni olishda xato', { id: attachment.id, error: String(err.message) });
      fail(res, 502, 'file_unavailable', 'Faylni Telegram\'dan olish imkoni bo\'lmadi (muddati o\'tgan bo\'lishi mumkin).');
    }
  });

  /* --- CSV eksport (zaxira/hisobot) --- */
  app.get('/api/export.csv', requireAuth, (req, res) => {
    const { rows } = db.listAppeals({ ...appealFilters(req), limit: 10_000, offset: 0 });

    /* CSV formula injection himoyasi: =, +, -, @ bilan boshlangan qiymatlar oldiga ' qo'yiladi */
    const cell = (value) => {
      let text = String(value ?? '').replace(/"/g, '""');
      if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
      return `"${text}"`;
    };
    const header = ['Raqam', 'Sana', 'Holat', 'Muallif', 'Username', 'Telefon', 'Telegram ID', 'Matn', 'Fayllar', 'Javoblar'];
    const lines = [header.map(cell).join(',')];
    for (const row of rows) {
      lines.push([
        row.code,
        new Date(row.created_at).toISOString(),
        row.status,
        row.author_name,
        row.author_username ? '@' + row.author_username : '',
        row.author_phone,
        row.tg_id,
        row.body,
        row.attachments_count,
        row.replies_count,
      ].map(cell).join(','));
    }
    db.audit(req.actor, 'export_csv', null, `${rows.length} qator`, ipHash(req));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="murojaatlar-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send('\uFEFF' + lines.join('\r\n'));          // BOM — Excel uchun
  });

  /* =====================================================================
     FOYDALANUVCHILAR (Telegram) — bloklash
     ===================================================================== */
  app.get('/api/tg-users', requireAuth, (req, res) => {
    const limit = clamp(toInt(req.query.limit, 50), 1, 200);
    const offset = clamp(toInt(req.query.offset, 0), 0, 1_000_000);
    res.json({
      rows: db.listUsers(limit, offset).map((u) => ({
        tgId: u.tg_id, username: u.username, name: [u.first_name, u.last_name].filter(Boolean).join(' '),
        phone: u.phone, appeals: u.appeals_count, isBlocked: !!u.is_blocked, blockReason: u.block_reason,
        firstSeen: u.first_seen, lastSeen: u.last_seen,
      })),
    });
  });

  app.post('/api/tg-users/:tgId/block', requireAuth, requireCsrf, (req, res) => {
    const tgId = toInt(req.params.tgId, -1);
    if (!db.getUser(tgId)) return fail(res, 404, 'not_found', 'Foydalanuvchi topilmadi.');
    const blocked = req.body?.blocked !== false;
    const reason = sanitizeText(req.body?.reason, 200);
    db.setUserBlocked(tgId, blocked, reason);
    db.audit(req.actor, blocked ? 'user_blocked' : 'user_unblocked', tgId, reason, ipHash(req));
    res.json({ ok: true });
  });

  /* =====================================================================
     ADMINLAR (faqat egasi) VA AUDIT
     ===================================================================== */
  /* ---- Ikki qadamli kirish (TOTP): o'z hisobing uchun ---- */
  app.post('/api/totp/init', requireAuth, requireCsrf, async (req, res) => {
    const admin = db.getAdmin(req.session.admin_id);
    if (!await verifyPasswordAsync(String(req.body?.password || ''), admin.password_hash)) {
      return fail(res, 401, 'bad_credentials', 'Parol xato.');
    }
    const secret = generateTotpSecret();
    const label = encodeURIComponent(`${config.facultyName} (${admin.username})`);
    res.json({
      secret,
      /* Ilovaga qo'lda kiritish uchun 4 talikka bo'lingan ko'rinish */
      formatted: secret.replace(/(.{4})/g, '$1 ').trim(),
      otpauth: `otpauth://totp/${label}?secret=${secret}&issuer=Murojaat%20paneli&algorithm=SHA1&digits=6&period=30`,
    });
  });

  app.post('/api/totp/enable', requireAuth, requireCsrf, (req, res) => {
    const secret = String(req.body?.secret || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
    const code = sanitizeText(req.body?.code, 8);
    if (secret.length < 16) return fail(res, 400, 'bad_secret', 'Kalit noto\'g\'ri — qaytadan boshlang.');
    if (!verifyTotp(secret, code)) return fail(res, 400, 'bad_totp', 'Kod xato yoki muddati o\'tgan. Qaytadan urinib ko\'ring.');
    db.setAdminTotp(req.session.admin_id, secret);
    db.audit(req.actor, 'totp_enabled', null, null, ipHash(req));
    res.json({ ok: true, message: 'Ikki qadamli kirish yoqildi.' });
  });

  app.post('/api/totp/disable', requireAuth, requireCsrf, async (req, res) => {
    const admin = db.getAdmin(req.session.admin_id);
    if (!await verifyPasswordAsync(String(req.body?.password || ''), admin.password_hash)) {
      return fail(res, 401, 'bad_credentials', 'Parol xato.');
    }
    db.setAdminTotp(req.session.admin_id, null);
    db.audit(req.actor, 'totp_disabled', null, null, ipHash(req));
    res.json({ ok: true, message: 'Ikki qadamli kirish o\'chirildi.' });
  });

  /* Kunlik xulosani darhol yuborish (sinab ko'rish uchun) */
  app.post('/api/digest', requireAuth, requireCsrf, requireOwner, async (req, res) => {
    const result = await sendDailyDigest({ force: true });
    db.audit(req.actor, 'digest_sent', null, JSON.stringify(result), ipHash(req));
    res.json({ ok: true, ...result });
  });

  app.get('/api/admins', requireAuth, requireOwner, (req, res) => {
    res.json({ rows: db.listAdmins().map((a) => ({
      id: a.id, username: a.username, role: a.role, isDisabled: !!a.is_disabled,
      createdAt: a.created_at, lastLoginAt: a.last_login_at, totpEnabled: !!a.totp_enabled,
    })) });
  });

  app.post('/api/admins', requireAuth, requireCsrf, requireOwner, async (req, res) => {
    const username = sanitizeText(req.body?.username, 32).toLowerCase();
    const password = String(req.body?.password || '');
    const role = req.body?.role === 'owner' ? 'owner' : 'operator';
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) return fail(res, 400, 'bad_username', 'Login: 3–32 belgi, faqat a-z 0-9 . _ -');
    if (password.length < 12) return fail(res, 400, 'weak_password', 'Parol kamida 12 belgi bo\'lishi kerak.');
    if (db.getAdminByUsername(username)) return fail(res, 409, 'exists', 'Bu login allaqachon mavjud.');
    const created = db.createAdmin({ username, passwordHash: await hashPasswordAsync(password), role });
    db.audit(req.actor, 'admin_created', username, role, ipHash(req));
    res.json({ ok: true, id: created.id });
  });

  app.post('/api/admins/:id/disable', requireAuth, requireCsrf, requireOwner, (req, res) => {
    const id = toInt(req.params.id, -1);
    const target = db.getAdmin(id);
    if (!target) return fail(res, 404, 'not_found', 'Admin topilmadi.');
    if (target.id === req.session.admin_id) return fail(res, 400, 'self', 'O\'zingizni o\'chirib qo\'ya olmaysiz.');
    const disabled = req.body?.disabled !== false;
    db.setAdminDisabled(id, disabled);
    if (disabled) db.revokeAdminSessions(id);
    db.audit(req.actor, disabled ? 'admin_disabled' : 'admin_enabled', target.username, null, ipHash(req));
    res.json({ ok: true });
  });

  app.get('/api/audit', requireAuth, requireOwner, (req, res) => {
    const limit = clamp(toInt(req.query.limit, 100), 1, 500);
    const offset = clamp(toInt(req.query.offset, 0), 0, 1_000_000);
    res.json({ rows: db.listAudit(limit, offset) });
  });

  /* =====================================================================
     STATIK FAYLLAR VA YAKUNIY ISHLOV
     ===================================================================== */
  app.use('/api', (req, res) => fail(res, 404, 'not_found', 'Bunday API yo\'q.'));

  app.use(express.static(path.join(__dirname, '..', 'public'), {
    index: 'index.html',
    etag: true,
    maxAge: '5m',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
    },
  }));

  /* Panel — bitta sahifa; qolgan yo'llar index.html'ga */
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  /* Kutilmagan xatolar — tafsilotlar faqat logda qoladi */
  app.use((err, req, res, _next) => {
    if (res.headersSent) return;
    /* Kirish ma'lumoti xatosi — bu server nosozligi emas */
    if (err?.type === 'entity.too.large' || err?.status === 413) {
      return fail(res, 413, 'payload_too_large', 'Yuborilgan ma\'lumot juda katta.');
    }
    if (err?.type === 'entity.parse.failed' || err?.status === 400) {
      return fail(res, 400, 'bad_json', 'So\'rov formati noto\'g\'ri.');
    }
    log.error('server xatosi', { path: req.path, error: String(err?.stack || err) });
    fail(res, 500, 'server_error', 'Server xatosi. Administratorga xabar bering.');
  });

  return app;
}

/** So'rovdagi filtrlar: holat, qidiruv, sana oralig'i, kechikkanlar */
function appealFilters(req) {
  const status = db.STATUSES.includes(String(req.query.status)) ? String(req.query.status) : '';
  const search = sanitizeText(req.query.search, 120);
  const parseDate = (value, endOfDay) => {
    const text = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    const ms = Date.parse(text + (endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'));
    if (!Number.isFinite(ms)) return null;
    /* Sana mahalliy vaqtda tanlanadi — UTC'ga keltiramiz */
    return ms - config.tzOffsetHours * 3600_000;
  };
  return {
    status,
    search,
    from: parseDate(req.query.from, false),
    to: parseDate(req.query.to, true),
    overdue: String(req.query.overdue || '') === '1' ? Date.now() - config.slaHours * 3600_000 : null,
  };
}

/* Panelga chiqadigan maydonlar (ichki ustunlar yashirin) */
function publicAppeal(row) {
  return {
    id: row.id,
    code: row.code,
    tgId: row.tg_id,
    authorName: row.author_name,
    authorUsername: row.author_username,
    authorPhone: row.author_phone,
    authorBlocked: !!row.author_blocked,
    body: row.body,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    answeredAt: row.answered_at,
    deletedAt: row.deleted_at,
    attachmentsCount: row.attachments_count ?? undefined,
    repliesCount: row.replies_count ?? undefined,
    notesCount: row.notes_count ?? undefined,
    progressNotifiedAt: row.progress_notified_at ?? null,
  };
}

module.exports = { createApp, COOKIE_NAME };
