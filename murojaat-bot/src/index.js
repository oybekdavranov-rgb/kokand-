'use strict';
/* =====================================================================
   KIRISH NUQTASI — botni va admin panel serverini ishga tushiradi.
   ===================================================================== */
const http = require('http');
const { config, validate } = require('./config');
const log = require('./logger');

/* --- 1. Sozlamalarni tekshirish: xato bo'lsa, ishga tushmaymiz --- */
const { fatal, warn } = validate();
for (const message of warn) log.warn('sozlama: ' + message);
if (fatal.length) {
  console.error('\n  ⛔️ Sozlamalarda xato — server ishga tushmadi:\n');
  for (const message of fatal) console.error('   • ' + message);
  console.error('\n  Yordam:  npm run setup  (kalitlarni yaratib, .env namunasini chiqaradi)\n');
  process.exit(1);
}

const db = require('./db');
const { bot, setMyCommands } = require('./bot');
const { createApp } = require('./server');

let server;
let shuttingDown = false;

async function main() {
  /* --- 2. Birinchi ishga tushishda admin (owner) hisobini yaratish --- */
  const owner = db.ensureOwner();
  if (owner) log.info(`admin hisobi yaratildi: "${owner.username}" (owner)`);
  db.purgeOld();

  /* Har 6 soatda eski sessiya/urinishlarni tozalash */
  const cleanup = setInterval(() => { try { db.purgeOld(); } catch (err) { log.warn('tozalash xatosi', { error: String(err.message) }); } }, 6 * 3600_000);
  cleanup.unref();

  /* --- 3. Web server (admin panel + webhook) --- */
  const app = createApp();
  server = http.createServer(app);
  server.headersTimeout = 20_000;
  server.requestTimeout = 60_000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, resolve);
  });

  /* --- 4. Telegram bot --- */
  if (config.botMode === 'polling') {
    /* bot.start() uzluksiz ishlaydi — kutib qolmaymiz */
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
      log.warn('Telegram bilan bog\'lanib bo\'lmadi — panel ishlaydi, webhook kelganda qayta urinadi', { error: String(err.message) });
    }
  }

  const where = config.publicUrl || `http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`;
  log.info('admin panel: ' + where);
  log.info(`rejim: ${config.nodeEnv} · ma'lumot: ${config.dbFile}`);
  if (config.botMode === 'webhook') log.info('webhook: ' + (config.webhookUrl || '(PUBLIC_URL yo\'q)') + '  — "npm run webhook set" bilan ro\'yxatdan o\'tkazing');
}

/* =====================================================================
   XAVFSIZ TO'XTASH
   ===================================================================== */
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info(`${signal} — to'xtatilmoqda…`);
  const timer = setTimeout(() => process.exit(1), 10_000);
  timer.unref();
  try { if (config.botMode === 'polling') await bot.stop(); } catch (err) { log.warn('botni to\'xtatishda xato', { error: String(err.message) }); }
  try { if (server) await new Promise((resolve) => server.close(resolve)); } catch { /* yopilgan */ }
  try { db.close(); } catch { /* yopilgan */ }
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
