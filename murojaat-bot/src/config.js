'use strict';
/* =====================================================================
   Sozlamalar — hammasi environment orqali (Replit'da "Secrets").
   Bu botda web-panel yo'q: murojaatlar to'g'ridan-to'g'ri Telegram'da
   adminga boradi, admin o'sha yerda javob beradi.
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* ---- .env faylini o'qish (tashqi kutubxonasiz) ---- */
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^export\s+/, '');
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    const quoted = (val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"));
    if (quoted) val = val.slice(1, -1);
    else val = val.replace(/\s+#.*$/, '').trim();      // satr ichidagi izoh
    if (process.env[key] === undefined || process.env[key] === '') process.env[key] = val;
  }
}
loadEnvFile(process.env.ENV_FILE || path.join(__dirname, '..', '.env'));

const str = (key, def = '') => (process.env[key] === undefined || process.env[key] === '' ? def : String(process.env[key]).trim());
const bool = (key, def) => {
  const v = str(key, '').toLowerCase();
  if (!v) return def;
  return ['1', 'true', 'yes', 'on', 'ha'].includes(v);
};
const list = (key) => str(key).split(/[,\s]+/).filter(Boolean);

/* Sonli sozlamalar: noto'g'ri qiymat jimgina sukutga tushmaydi */
const numberIssues = [];
const num = (key, def, { min = -Infinity, max = Infinity, int = true } = {}) => {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) { numberIssues.push(`${key}="${raw}" son emas.`); return def; }
  if (int && !Number.isInteger(n)) { numberIssues.push(`${key}=${raw} butun son bo'lishi kerak.`); return def; }
  if (n < min || n > max) { numberIssues.push(`${key}=${n} chegaradan tashqarida (${min}…${max}).`); return def; }
  return n;
};

/* ---- Replit muhitini avtomatik aniqlash ---- */
const isReplit = !!(process.env.REPL_ID || process.env.REPL_SLUG || process.env.REPLIT_DEPLOYMENT);
const replitDomain = (() => {
  const first = (str('REPLIT_DOMAINS') || str('REPLIT_DEV_DOMAIN')).split(',')[0].trim();
  if (first) return first;
  const slug = str('REPL_SLUG');
  const owner = str('REPL_OWNER');
  return slug && owner ? `${slug}.${owner}.repl.co` : '';
})();

const NODE_ENV = str('NODE_ENV', isReplit ? 'production' : 'development');
const isProd = NODE_ENV === 'production' || str('REPLIT_DEPLOYMENT') === '1';
const dataDir = path.resolve(str('DATA_DIR', path.join(__dirname, '..', 'data')));

const config = {
  nodeEnv: NODE_ENV,
  isProd,
  isReplit,

  /* --- Telegram --- */
  botToken: str('BOT_TOKEN'),
  botApiRoot: str('BOT_API_ROOT', 'https://api.telegram.org').replace(/\/+$/, ''),
  botMode: str('BOT_MODE', 'polling').toLowerCase(),        // polling | webhook
  webhookSecret: str('WEBHOOK_SECRET'),

  /* --- Admin (murojaatlar shu chatlarga boradi) --- */
  adminChatIds: list('ADMIN_CHAT_IDS').map(Number).filter(Number.isFinite),
  /* Kim admin amallarini bajara oladi. Bo'sh bo'lsa — admin chatidagi hamma. */
  adminUserIds: list('ADMIN_USER_IDS').map(Number).filter(Number.isFinite),

  /* --- Web (faqat holat tekshiruvi va webhook uchun) --- */
  port: num('PORT', 8080, { min: 1, max: 65535 }),
  host: str('HOST', isReplit ? '0.0.0.0' : '127.0.0.1'),
  publicUrl: (str('PUBLIC_URL') || (replitDomain ? 'https://' + replitDomain : '')).replace(/\/+$/, ''),

  /* --- Murojaat qoidalari (kategoriya yo'q) --- */
  appealMinLength: num('APPEAL_MIN_LENGTH', 12, { min: 1, max: 500 }),
  appealMaxLength: num('APPEAL_MAX_LENGTH', 3500, { min: 100, max: 3900 }),
  appealsPerHour: num('APPEALS_PER_HOUR', 4, { min: 1, max: 1000 }),
  appealsPerDay: num('APPEALS_PER_DAY', 12, { min: 1, max: 10000 }),
  appealCooldownSeconds: num('APPEAL_COOLDOWN_SECONDS', 20, { min: 0, max: 3600 }),
  maxAttachmentsPerAppeal: num('MAX_ATTACHMENTS_PER_APPEAL', 10, { min: 1, max: 50 }),
  maxAttachmentMb: num('MAX_ATTACHMENT_MB', 20, { min: 1, max: 2000 }),

  /* --- Nazorat --- */
  slaHours: num('SLA_HOURS', 48, { min: 1, max: 8760 }),
  digestHour: num('DIGEST_HOUR', 9, { min: 0, max: 23 }),
  tzOffsetHours: num('TZ_OFFSET_HOURS', 5, { min: -12, max: 14, int: false }),
  notifyUserOnProgress: bool('NOTIFY_USER_ON_PROGRESS', true),

  /* --- Zaxira va doimiy saqlash --- */
  backupToTelegram: bool('BACKUP_TO_TELEGRAM', true),
  backupHours: num('BACKUP_HOURS', 24, { min: 1, max: 720 }),
  backupChatId: num('BACKUP_CHAT_ID', 0, { min: -1e15, max: 1e15 }),
  /* Zaxira guruhga yuborilsin? Sukut: YO'Q (bazada shaxsiy ma'lumot bor) */
  backupAllowGroup: bool('BACKUP_ALLOW_GROUP', false),
  storageMode: str('STORAGE_MODE', isReplit ? 'replit' : 'off').toLowerCase(),
  storageDir: str('STORAGE_DIR', ''),
  snapshotMinutes: num('SNAPSHOT_MINUTES', 2, { min: 1, max: 1440 }),

  /* --- Ma'lumotlar --- */
  dataDir,
  dbFile: path.resolve(str('DB_FILE', path.join(dataDir, 'murojaat.db'))),

  /* --- Fakultet / dekan --- */
  facultyName: str('FACULTY_NAME', "Qo'qon universiteti Ta'lim fakulteti"),
  deanName: str('DEAN_NAME', "Xursanaliyev Boburmirzo Farhod o'g'li"),
  deanTitle: str('DEAN_TITLE', 'dekan'),
  officeHours: str('OFFICE_HOURS', 'Dushanba–Shanba, 09:00–17:00'),
};

/* Webhook yo'li maxfiy: token va maxfiy kalitdan hosil qilinadi */
config.webhookPath = config.botToken && config.webhookSecret
  ? '/tg/' + crypto.createHmac('sha256', config.webhookSecret).update(config.botToken).digest('hex').slice(0, 32)
  : '/tg/disabled';
config.webhookUrl = config.publicUrl ? config.publicUrl + config.webhookPath : '';

function validate() {
  const fatal = [...numberIssues];
  const warn = [];

  if (!['production', 'development', 'test'].includes(NODE_ENV)) {
    fatal.push(`NODE_ENV="${NODE_ENV}" noto'g'ri — faqat production, development yoki test.`);
  }
  if (!config.botToken) fatal.push('BOT_TOKEN ko\'rsatilmagan (@BotFather bergan token).');
  else if (!/^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(config.botToken)) warn.push('BOT_TOKEN formati odatdagidan farq qiladi — tekshiring.');

  if (!config.adminChatIds.length && !config.adminUserIds.length) {
    fatal.push('ADMIN_CHAT_IDS ham, ADMIN_USER_IDS ham ko\'rsatilmagan — murojaatlar kimga ' +
      'yuborilishini bilmaymiz. O\'z Telegram ID\'ingizni @userinfobot dan oling.');
  }
  if (!['polling', 'webhook'].includes(config.botMode)) fatal.push('BOT_MODE faqat "polling" yoki "webhook".');
  if (config.botMode === 'webhook') {
    if (config.webhookSecret.length < 24) fatal.push('WEBHOOK_SECRET kamida 24 belgi bo\'lishi kerak.');
    if (!config.publicUrl) fatal.push('PUBLIC_URL ko\'rsatilmagan (webhook rejimi).');
    else if (isProd && !config.publicUrl.startsWith('https://')) fatal.push('PUBLIC_URL https:// bilan boshlanishi shart.');
  }
  if (!['replit', 'local', 'off'].includes(config.storageMode)) {
    fatal.push('STORAGE_MODE faqat "replit", "local" yoki "off" bo\'lishi mumkin.');
  }
  if (config.appealMaxLength > 3800) warn.push('APPEAL_MAX_LENGTH juda katta — Telegram xabari 4096 belgidan oshmaydi.');
  if (!config.adminUserIds.length && config.adminChatIds.some((id) => id < 0)) {
    fatal.push('Admin chati GURUH, lekin ADMIN_USER_IDS bo\'sh — bunda guruhdagi har kim ' +
      'dekanat nomidan javob bera oladi, fuqarolarni bloklaydi va /zaxira bilan bazani yuklab oladi. ' +
      'ADMIN_USER_IDS ga javob bera oladigan xodimlar ID\'sini yozing (@userinfobot).');
  }
  if (config.backupToTelegram && config.backupChatId < 0 && !config.backupAllowGroup) {
    warn.push('BACKUP_CHAT_ID guruhni ko\'rsatadi — zaxira yuborilmaydi. Shaxsiy chat ID\'sini yozing ' +
      '(yoki ataylab xohlasangiz BACKUP_ALLOW_GROUP=true).');
  }
  if (config.backupToTelegram && !config.backupChatId && !config.adminChatIds.some((id) => id > 0)) {
    warn.push('Avtomatik zaxira yuborilmaydi: shaxsiy chat yo\'q. BACKUP_CHAT_ID ga o\'z Telegram ID\'ingizni yozing.');
  }
  if (isReplit && config.storageMode === 'off') {
    warn.push('DIQQAT: Replit\'da fayl tizimi saqlanmaydi. STORAGE_MODE=replit qiling, aks holda qayta nashrda murojaatlar tarixi yo\'qoladi ' +
      '(murojaatlarning o\'zi Telegram chatida qoladi).');
  }
  return { fatal, warn };
}

module.exports = { config, validate };
