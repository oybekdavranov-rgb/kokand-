'use strict';
/* =====================================================================
   KIRISH NUQTASI

   Botni ishga tushiradi. Web-panel yo'q — HTTP server faqat ikki narsa
   uchun kerak: holat tekshiruvi (/healthz) va webhook rejimi.
   ===================================================================== */
const http = require('http');
const { webhookCallback } = require('grammy');
const { config, validate } = require('./config');
const log = require('./logger');

/* --- 1. Sozlamalarni tekshirish --- */
const { fatal, warn } = validate();
for (const message of warn) log.warn('sozlama: ' + message);
if (fatal.length) {
  console.error('\n  ⛔️ Sozlamalarda xato — bot ishga tushmadi:\n');
  for (const message of fatal) console.error('   • ' + message);
  console.error('\n  Kerakli sozlamalar: BOT_TOKEN va ADMIN_CHAT_IDS');
  console.error('  Namuna: .env.example faylida, qo\'llanma: README.md\n');
  process.exit(1);
}

/* Doimiy saqlash bazaga tegmaydi — uni oldin yuklash mumkin */
const storage = require('./storage');

let store = null;
let bot = null;
let setMyCommands = null;
let sendDailyDigest = null;
let sendBackupToTelegram = null;
let retryUndelivered = null;
let server = null;
let shuttingDown = false;

function createServer() {
  const webhook = config.botMode === 'webhook'
    ? webhookCallback(bot, 'http', { secretToken: config.webhookSecret, timeoutMilliseconds: 25_000, onTimeout: 'return' })
    : null;

  /* Himoya qatlami: update'ni ishlashda xato bo'lsa ham Telegram'ga javob
     qaytaramiz — aks holda so'rov osilib qoladi va Telegram uni qayta-qayta
     yuboradi (cheksiz tsikl). */
  const handleWebhook = webhook
    ? (req, res) => Promise.resolve(webhook(req, res)).catch((err) => {
      log.error('webhook update ishlanmadi', { error: String(err?.message || err) });
      if (!res.headersSent) { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); }
      else if (!res.writableEnded) res.end();
    })
    : null;

  return http.createServer((req, res) => {
    const url = (req.url || '').split('?')[0];

    if (handleWebhook && req.method === 'POST' && url === config.webhookPath) {
      return handleWebhook(req, res);
    }

    if (req.method === 'GET' && (url === '/healthz' || url === '/' || url === '/health')) {
      const botReady = !!bot.botInfo;
      const botOk = config.botMode !== 'polling' || botReady;
      const body = JSON.stringify({
        ok: botOk,
        bot: botReady,
        mode: config.botMode,
        storage: storage.isEnabled(),
        admins: config.adminChatIds.length,
        time: new Date().toISOString(),
      });
      res.writeHead(botOk ? 200 : 503, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': 'noindex, nofollow',
      });
      return res.end(body);
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex' });
    res.end('Bu manzilda hech narsa yo\'q. Murojaat uchun Telegram botdan foydalaning.\n');
  });
}

async function main() {
  /* --- 2. Saqlangan bazani tiklash (Replit kabi muhitlar uchun) --- */
  await storage.restoreIfMissing();

  store = require('./store');
  ({ bot, setMyCommands, sendDailyDigest, sendBackupToTelegram, retryUndelivered } = require('./bot'));

  /* --- 3. Jadvalli vazifalar --- */
  const digest = setInterval(() => {
    sendDailyDigest().catch((err) => log.warn('kunlik xulosa xatosi', { error: String(err.message) }));
    sendBackupToTelegram().catch((err) => log.warn('zaxira xatosi', { error: String(err.message) }));
  }, 20 * 60_000);
  digest.unref();

  /* Dekanat chati bir lahza ishlamagan bo'lsa — murojaatni qayta yuboramiz */
  const retry = setInterval(() => {
    retryUndelivered().catch((err) => log.warn('qayta yuborish xatosi', { error: String(err.message) }));
  }, 5 * 60_000);
  retry.unref();
  const firstRetry = setTimeout(() => {
    retryUndelivered().catch((err) => log.warn('qayta yuborish xatosi', { error: String(err.message) }));
  }, 30_000);
  firstRetry.unref();

  if (config.backupToTelegram) {
    const firstBackup = setTimeout(() => {
      sendBackupToTelegram().catch((err) => log.warn('zaxira xatosi', { error: String(err.message) }));
    }, 2 * 60_000);
    firstBackup.unref();
  }

  if (storage.isEnabled()) {
    const sync = setInterval(() => {
      storage.snapshot('interval').catch((err) => log.warn('nusxa xatosi', { error: String(err.message) }));
    }, config.snapshotMinutes * 60_000);
    sync.unref();
  }

  /* --- 4. HTTP server (holat + webhook) --- */
  server = createServer();
  server.headersTimeout = 20_000;
  server.requestTimeout = 60_000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, resolve);
  });

  /* --- 5. Bot --- */
  if (config.botMode === 'polling') {
    bot.start({
      drop_pending_updates: false,
      allowed_updates: ['message', 'callback_query'],
      onStart: (info) => log.info(`bot "polling" rejimida ishga tushdi: @${info.username}`),
    }).catch((err) => log.error('bot ishga tushmadi (polling)', { error: String(err.message) }));
    setMyCommands().catch((err) => log.warn('buyruqlar ro\'yxati o\'rnatilmadi', { error: String(err.message) }));
  } else {
    try {
      await bot.init();
      log.info(`bot "webhook" rejimida: @${bot.botInfo.username}`);
      await setMyCommands();
    } catch (err) {
      log.warn('Telegram bilan bog\'lanib bo\'lmadi — webhook kelganda qayta urinadi', { error: String(err.message) });
    }
  }

  log.info(`murojaatlar shu chatlarga boradi: ${config.adminChatIds.join(', ')}`);
  log.info(`rejim: ${config.nodeEnv} · ma'lumot: ${config.dbFile}`);
  log.info(`holat tekshiruvi: http://${config.host}:${config.port}/healthz`);
  if (config.isReplit) log.info('muhit: Replit' + (storage.isEnabled() ? ' (doimiy saqlash yoqilgan)' : ' ⚠️ doimiy saqlash YO\'Q'));
  if (config.botMode === 'webhook') log.info('webhook: ' + (config.webhookUrl || '(PUBLIC_URL yo\'q)') + ' — "npm run webhook set" bilan ro\'yxatdan o\'tkazing');
}

/* =====================================================================
   XAVFSIZ TO'XTASH
   ===================================================================== */
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info(`${signal} — to'xtatilmoqda…`);
  const timer = setTimeout(() => process.exit(1), 20_000);
  timer.unref();

  try { if (config.botMode === 'polling' && bot) await bot.stop(); }
  catch (err) { log.warn('botni to\'xtatishda xato', { error: String(err.message) }); }

  try { if (server) await new Promise((resolve) => server.close(resolve)); } catch { /* yopilgan */ }

  if (store && storage.isEnabled()) {
    try { await storage.snapshot('shutdown'); }
    catch (err) { log.error('oxirgi nusxa saqlanmadi', { error: String(err.message) }); }
  }

  if (store && config.backupToTelegram && signal !== 'uncaughtException') {
    try {
      const result = await Promise.race([
        sendBackupToTelegram({ force: true }),
        new Promise((resolve) => setTimeout(() => resolve({ sent: false, reason: 'vaqt tugadi' }), 8_000)),
      ]);
      log.info('to\'xtashdan oldingi zaxira: ' + (result.sent ? 'yuborildi' : result.reason || result.error));
    } catch (err) { log.warn('to\'xtashdan oldingi zaxira xatosi', { error: String(err.message) }); }
  }

  try { if (store) store.close(); } catch { /* yopilgan */ }
  log.info('to\'xtadi.');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => log.error('ushlanmagan promise xatosi', { error: String(reason?.stack || reason) }));
process.on('uncaughtException', (err) => {
  log.error('ushlanmagan xato', { error: String(err?.stack || err) });
  shutdown('uncaughtException');
});

main().catch((err) => {
  log.error('ishga tushirish xatosi', { error: String(err?.stack || err) });
  process.exit(1);
});
