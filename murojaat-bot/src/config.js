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
const { HASH_PATTERN } = require('./security');

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
    if (quoted) {
      val = val.slice(1, -1);
    } else {
      /* Satr ichidagi izohni kesamiz: "NODE_ENV=production   # izoh" */
      val = val.replace(/\s+#.*$/, '').trim();
    }
    /* Bo'sh qiymatli o'zgaruvchi .env dagi qiymatni to'sib qo'ymasin */
    if (process.env[key] === undefined || process.env[key] === '') process.env[key] = val;
  }
}
loadEnvFile(process.env.ENV_FILE || path.join(__dirname, '..', '.env'));

const str = (key, def = '') => (process.env[key] === undefined || process.env[key] === '' ? def : String(process.env[key]).trim());
/* Sonli sozlamalar: noto'g'ri yoki chegaradan tashqari qiymat JIMGINA
   sukutga tushmaydi — ro'yxatga olinadi va ishga tushishni to'xtatadi. */
const numberIssues = [];
const num = (key, def, { min = -Infinity, max = Infinity, int = true } = {}) => {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    numberIssues.push(`${key}="${raw}" son emas (kutilgan: ${min}…${max}).`);
    return def;
  }
  /* Kasrli qiymat jimgina noto'g'ri ishlashga olib keladi
     (masalan DIGEST_HOUR=9.5 — kunlik xulosa hech qachon yuborilmaydi) */
  if (int && !Number.isInteger(n)) {
    numberIssues.push(`${key}=${raw} butun son bo'lishi kerak.`);
    return def;
  }
  if (n < min || n > max) {
    numberIssues.push(`${key}=${n} chegaradan tashqarida (ruxsat: ${min}…${max}).`);
    return def;
  }
  return n;
};
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
  port: num('PORT', 8080, { min: 1, max: 65535 }),
  /* Standart: faqat loopback. Panel hech qachon to'g'ridan tashqi
     interfeysda tinglamasligi kerak — oldida nginx (TLS) turadi.
     Docker ichida HOST=0.0.0.0 qilinadi (konteyner tarmog'i uchun). */
  host: str('HOST', '127.0.0.1'),
  /* Reverse-proxy ortida: 'loopback' (nginx bir mashinada) yoki aniq IP.
     "1" (hop soni) XAVFLI — mijoz X-Forwarded-For/Proto'ni soxtalashtira oladi. */
  trustProxy: str('TRUST_PROXY', isProd ? 'loopback' : ''),
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
  sessionTtlHours: num('SESSION_TTL_HOURS', 12, { min: 1, max: 720 }),
  sessionIdleMinutes: num('SESSION_IDLE_MINUTES', 90, { min: 5, max: 1440 }),
  loginMaxAttempts: num('LOGIN_MAX_ATTEMPTS', 8, { min: 3, max: 1000 }),
  loginWindowMinutes: num('LOGIN_WINDOW_MINUTES', 15, { min: 1, max: 1440 }),

  /* --- Murojaat qoidalari (kategoriya yo'q — faqat hajm va spam chegaralari) --- */
  appealMinLength: num('APPEAL_MIN_LENGTH', 12, { min: 1, max: 500 }),
  appealMaxLength: num('APPEAL_MAX_LENGTH', 3500, { min: 100, max: 3900 }),
  appealsPerHour: num('APPEALS_PER_HOUR', 4, { min: 1, max: 1000 }),
  appealsPerDay: num('APPEALS_PER_DAY', 12, { min: 1, max: 10000 }),
  appealCooldownSeconds: num('APPEAL_COOLDOWN_SECONDS', 20, { min: 0, max: 3600 }),
  maxAttachmentsPerAppeal: num('MAX_ATTACHMENTS_PER_APPEAL', 10, { min: 1, max: 50 }),
  maxAttachmentMb: num('MAX_ATTACHMENT_MB', 20, { min: 1, max: 2000 }),

  /* --- Nazorat: javobsiz qolgan murojaatlar va kunlik xulosa --- */
  slaHours: num('SLA_HOURS', 48, { min: 1, max: 8760 }),                       // shu muddatdan oshsa "kechikkan"
  digestHour: num('DIGEST_HOUR', 9, { min: 0, max: 23 }),                    // kunlik xulosa soati (mahalliy vaqt)
  tzOffsetHours: num('TZ_OFFSET_HOURS', 5, { min: -12, max: 14, int: false }),             // O'zbekiston: UTC+5
  notifyUserOnProgress: bool('NOTIFY_USER_ON_PROGRESS', true),

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
  const fatal = [...numberIssues];
  const warn = [];

  if (!['production', 'development', 'test'].includes(NODE_ENV)) {
    fatal.push(`NODE_ENV="${NODE_ENV}" noto'g'ri — faqat production, development yoki test. ` +
      '(.env da satr ichida izoh yozgan bo\'lishingiz mumkin.)');
  }

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
  if (config.adminPasswordHash && !HASH_PATTERN.test(config.adminPasswordHash)) {
    fatal.push('ADMIN_PASSWORD_HASH formati noto\'g\'ri yoki to\'liq emas — "npm run hash" bilan qaytadan yarating. ' +
      '(Agar docker-compose ishlatayotgan bo\'lsangiz, hash ichidagi "$" belgilari yo\'qolgan bo\'lishi mumkin — ' +
      'yangi format "." bilan yoziladi.)');
  }

  if (isProd && !config.requireHttps) warn.push('REQUIRE_HTTPS o\'chirilgan — admin panel faqat HTTPS orqali ishlatilishi kerak.');
  if (config.trustProxy === '1' || config.trustProxy === '2') {
    warn.push('TRUST_PROXY raqam bilan berilgan — mijoz X-Forwarded-For/Proto\'ni soxtalashtirishi mumkin. ' +
      'Bir mashinadagi nginx uchun TRUST_PROXY=loopback, boshqa serverdagi proksi uchun uning IP manzilini yozing.');
  }
  if (isProd && config.host === '0.0.0.0' && !bool('ALLOW_PUBLIC_BIND', false)) {
    warn.push('HOST=0.0.0.0 — panel barcha tarmoq interfeyslarida ochiq. Nginx ortida ishlatsangiz HOST=127.0.0.1 qiling.');
  }
  if (!config.notifyChatIds.length) warn.push('NOTIFY_CHAT_IDS bo\'sh — yangi murojaat haqida Telegram xabarnomasi yuborilmaydi.');
  if (config.appealMaxLength > 3800) warn.push('APPEAL_MAX_LENGTH juda katta — Telegram xabari 4096 belgidan oshmaydi.');
  if (config.digestHour < 0 || config.digestHour > 23) fatal.push('DIGEST_HOUR 0 dan 23 gacha bo\'lishi kerak.');
  if (config.slaHours < 1) fatal.push('SLA_HOURS kamida 1 bo\'lishi kerak.');

  return { fatal, warn };
}

module.exports = { config, validate, loadEnvFile };
