'use strict';
/* =====================================================================
   Sozlamalar (konfiguratsiya) — hammasi environment orqali boshqariladi.
   Maxfiy qiymatlar hech qachon kodda saqlanmaydi. Ishlab chiqarish
   (production) rejimida zaif/standart qiymatlar bilan server ishga
   TUSHMAYDI — bu ataylab qilingan himoya.
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* ---- .env faylini o'qish (tashqi kutubxonasiz) ---- */
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    const quoted = (val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"));
    if (quoted) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnvFile(process.env.ENV_FILE || path.join(__dirname, '..', '.env'));

const str = (key, def = '') => (process.env[key] === undefined || process.env[key] === '' ? def : String(process.env[key]).trim());
const num = (key, def) => { const n = Number(process.env[key]); return Number.isFinite(n) ? n : def; };
const bool = (key, def) => {
  const v = str(key, '').toLowerCase();
  if (!v) return def;
  return ['1', 'true', 'yes', 'on', 'ha'].includes(v);
};
const list = (key) => str(key, '').split(/[,\s]+/).filter(Boolean);

const NODE_ENV = str('NODE_ENV', 'development');
const isProd = NODE_ENV === 'production';

/* Zaif, hammaga ma'lum qiymatlar — production'da qat'iyan taqiqlanadi */
const WEAK = [
  'change-me', 'changeme', 'secret', 'password', 'parol', '123456', 'admin',
  'kokand2026', 'bu-yerga-uzun-tasodifiy-maxfiy-kalit-yozing', 'test', 'qwerty'
];
const isWeak = (v) => !v || WEAK.includes(v.toLowerCase());

const dataDir = path.resolve(str('DATA_DIR', path.join(__dirname, '..', 'data')));

const config = {
  nodeEnv: NODE_ENV,
  isProd,

  /* --- HTTP --- */
  port: num('PORT', 8080),
  host: str('HOST', '0.0.0.0'),
  /* Reverse-proxy (nginx) ortida ishlaganda: 1 yoki 'loopback' */
  trustProxy: str('TRUST_PROXY', isProd ? '1' : ''),
  requireHttps: bool('REQUIRE_HTTPS', isProd),
  publicUrl: str('PUBLIC_URL', '').replace(/\/+$/, ''),

  /* --- Telegram --- */
  botToken: str('BOT_TOKEN'),
  botApiRoot: str('BOT_API_ROOT', 'https://api.telegram.org').replace(/\/+$/, ''),
  botMode: str('BOT_MODE', 'polling').toLowerCase(),      // polling | webhook
  webhookSecret: str('WEBHOOK_SECRET'),
  /* Dekan/qabulxona Telegram chat ID'lari — yangi murojaat xabari shu yerga keladi */
  notifyChatIds: list('NOTIFY_CHAT_IDS').map(Number).filter(Number.isFinite),

  /* --- Admin panel --- */
  sessionSecret: str('SESSION_SECRET'),
  adminUsername: str('ADMIN_USERNAME', 'admin'),
  adminPassword: str('ADMIN_PASSWORD'),            // faqat birinchi ishga tushishda; darhol hash qilinadi
  adminPasswordHash: str('ADMIN_PASSWORD_HASH'),   // tavsiya etilgan usul
  sessionTtlHours: num('SESSION_TTL_HOURS', 12),
  sessionIdleMinutes: num('SESSION_IDLE_MINUTES', 90),
  loginMaxAttempts: num('LOGIN_MAX_ATTEMPTS', 8),
  loginWindowMinutes: num('LOGIN_WINDOW_MINUTES', 15),

  /* --- Murojaat qoidalari (kategoriya yo'q — faqat hajm va spam chegaralari) --- */
  appealMinLength: num('APPEAL_MIN_LENGTH', 12),
  appealMaxLength: num('APPEAL_MAX_LENGTH', 3500),
  appealsPerHour: num('APPEALS_PER_HOUR', 4),
  appealsPerDay: num('APPEALS_PER_DAY', 12),
  appealCooldownSeconds: num('APPEAL_COOLDOWN_SECONDS', 20),
  maxAttachmentsPerAppeal: num('MAX_ATTACHMENTS_PER_APPEAL', 10),
  maxAttachmentMb: num('MAX_ATTACHMENT_MB', 20),

  /* --- Ma'lumotlar --- */
  dataDir,
  dbFile: path.resolve(str('DB_FILE', path.join(dataDir, 'murojaat.db'))),

  /* --- Fakultet / dekan ma'lumotlari (xabarlar matnida ishlatiladi) --- */
  facultyName: str('FACULTY_NAME', "Qo'qon universiteti Ta'lim fakulteti"),
  deanName: str('DEAN_NAME', "Xursanaliyev Boburmirzo Farhod o'g'li"),
  deanTitle: str('DEAN_TITLE', 'dekan'),
  officeHours: str('OFFICE_HOURS', 'Dushanba–Shanba, 09:00–17:00'),
};

/* Webhook yo'li maxfiy: token va maxfiy kalitdan hosil qilinadi.
   Shu bilan yo'lning o'zi ham "bilish kerak" sirga aylanadi. */
config.webhookPath = config.botToken && config.webhookSecret
  ? '/tg/' + crypto.createHmac('sha256', config.webhookSecret).update(config.botToken).digest('hex').slice(0, 32)
  : '/tg/disabled';

config.webhookUrl = config.publicUrl ? config.publicUrl + config.webhookPath : '';
config.panelUrl = config.publicUrl || '';

/* =====================================================================
   Tekshiruv: xatolar bo'lsa — tushunarli ro'yxat bilan to'xtaymiz
   ===================================================================== */
function validate() {
  const fatal = [];
  const warn = [];

  if (!config.botToken) fatal.push('BOT_TOKEN ko\'rsatilmagan (@BotFather bergan token).');
  else if (!/^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(config.botToken)) warn.push('BOT_TOKEN formati odatdagidan farq qiladi — tekshirib ko\'ring.');

  if (!['polling', 'webhook'].includes(config.botMode)) fatal.push('BOT_MODE faqat "polling" yoki "webhook" bo\'lishi mumkin.');

  if (config.botMode === 'webhook') {
    if (config.webhookSecret.length < 24) fatal.push('WEBHOOK_SECRET kamida 24 belgi bo\'lishi kerak (webhook rejimi).');
    if (!config.publicUrl) fatal.push('PUBLIC_URL ko\'rsatilmagan (webhook rejimi uchun https manzil kerak).');
    else if (isProd && !config.publicUrl.startsWith('https://')) fatal.push('PUBLIC_URL https:// bilan boshlanishi shart.');
  }

  if (!config.sessionSecret) fatal.push('SESSION_SECRET ko\'rsatilmagan (npm run setup buyrug\'i yaratib beradi).');
  else if (config.sessionSecret.length < 32) fatal.push('SESSION_SECRET kamida 32 belgi bo\'lishi kerak.');
  else if (isWeak(config.sessionSecret)) fatal.push('SESSION_SECRET zaif/standart qiymat — tasodifiy kalit yozing.');

  if (!config.adminPasswordHash && !config.adminPassword) {
    fatal.push('ADMIN_PASSWORD_HASH (tavsiya) yoki ADMIN_PASSWORD ko\'rsatilmagan.');
  }
  if (config.adminPassword) {
    if (isWeak(config.adminPassword)) fatal.push('ADMIN_PASSWORD zaif/standart parol — boshqasini tanlang.');
    else if (config.adminPassword.length < 12) fatal.push('ADMIN_PASSWORD kamida 12 belgi bo\'lishi kerak.');
    else warn.push('ADMIN_PASSWORD ochiq matnda. Birinchi ishga tushishdan keyin uni .env dan olib tashlang (parol bazada hash ko\'rinishida saqlanadi).');
  }
  if (config.adminPasswordHash && !config.adminPasswordHash.startsWith('scrypt$')) {
    fatal.push('ADMIN_PASSWORD_HASH formati noto\'g\'ri — "npm run hash" bilan qaytadan yarating.');
  }

  if (isProd && !config.requireHttps) warn.push('REQUIRE_HTTPS o\'chirilgan — admin panel faqat HTTPS orqali ishlatilishi kerak.');
  if (!config.notifyChatIds.length) warn.push('NOTIFY_CHAT_IDS bo\'sh — yangi murojaat haqida Telegram xabarnomasi yuborilmaydi.');
  if (config.appealMaxLength > 3800) warn.push('APPEAL_MAX_LENGTH juda katta — Telegram xabari 4096 belgidan oshmaydi.');

  return { fatal, warn };
}

module.exports = { config, validate, loadEnvFile };
