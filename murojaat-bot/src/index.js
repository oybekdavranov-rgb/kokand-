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
  console.error('\n  Yordam:  npm run setup  (kalitlarni yaratib, .env namunasini chiqaradi)');
  console.error('  Replit uchun:  npm run replit-secrets -- "Parolingiz"\n');
  process.exit(1);
}

/* Doimiy saqlash moduli bazaga TEGMAYDI — uni bazadan oldin yuklash mumkin */
const storage = require('./storage');

/* Quyidagilar bazani ochadi, shuning uchun tiklashdan KEYIN yuklanadi */
let db = null;
let bot = null;
let setMyCommands = null;
let sendDailyDigest = null;
let sendBackupToTelegram = null;
let createApp = null;

let server;
let shuttingDown = false;

async function main() {
  /* --- 2. Replit kabi muhitlarda: saqlangan bazani tiklaymiz --- */
  await storage.restoreIfMissing();

  db = require('./db');
  ({ bot, setMyCommands, sendDailyDigest, sendBackupToTelegram } = require('./bot'));
  ({ createApp } = require('./server'));

  /* --- 3. Birinchi ishga tushishda admin (owner) hisobini yaratish --- */
  const owner = db.ensureOwner();
  if (owner) log.info(`admin hisobi yaratildi: "${owner.username}" (owner)`);
  db.purgeOld();

  /* Har 6 soatda eski sessiya/urinishlarni tozalash */
  const cleanup = setInterval(() => {
    try { db.purgeOld(); } catch (err) { log.warn('tozalash xatosi', { error: String(err.message) }); }
  }, 6 * 3600_000);
  cleanup.unref();

  /* Kunlik xulosa va Telegram zaxirasi: har 20 daqiqada tekshiriladi */
  const digest = setInterval(() => {
    sendDailyDigest().catch((err) => log.warn('kunlik xulosa xatosi', { error: String(err.message) }));
    sendBackupToTelegram().catch((err) => log.warn('zaxira xatosi', { error: String(err.message) }));
  }, 20 * 60_000);
  digest.unref();

  if (config.backupToTelegram) {
    const firstBackup = setTimeout(() => {
      sendBackupToTelegram().catch((err) => log.warn('zaxira xatosi', { error: String(err.message) }));
    }, 2 * 60_000);
    firstBackup.unref();
  }

  /* Doimiy saqlash: o'zgarish bo'lsa nusxani yangilab turamiz */
  if (storage.isEnabled()) {
    const sync = setInterval(() => {
      storage.snapshot('interval').catch((err) => log.warn('nusxa xatosi', { error: String(err.message) }));
    }, config.snapshotMinutes * 60_000);
    sync.unref();
  }

  /* --- 4. Web server (admin panel + webhook) --- */
  const app = createApp();
  server = http.createServer(app);
  server.headersTimeout = 20_000;
  server.requestTimeout = 60_000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, resolve);
  });

  /* --- 5. Telegram bot --- */
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
      log.warn('Telegram bilan bog\'lanib bo\'lmadi — panel ishlaydi, webhook kelganda qayta urinadi', { error: String(err.message) });
    }
  }

  const where = config.publicUrl || `http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`;
  log.info('admin panel: ' + where);
  log.info(`rejim: ${config.nodeEnv} · ma'lumot: ${config.dbFile}`);
  if (config.isReplit) log.info('muhit: Replit' + (storage.isEnabled() ? ' (doimiy saqlash yoqilgan)' : ' ⚠️ doimiy saqlash YO\'Q'));
  if (config.botMode === 'webhook') log.info('webhook: ' + (config.webhookUrl || '(PUBLIC_URL yo\'q)') + '  — "npm run webhook set" bilan ro\'yxatdan o\'tkazing');
}

/* =====================================================================
   XAVFSIZ TO'XTASH
   Replit'da to'xtash = konteyner yo'qolishi bo'lishi mumkin, shuning uchun
   chiqishdan oldin bazani saqlab qolishga ulguramiz.
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

  /* Oxirgi nusxani tashqi xotiraga saqlaymiz (eng muhim qadam) */
  if (db && storage.isEnabled()) {
    try { await storage.snapshot('shutdown'); }
    catch (err) { log.error('oxirgi nusxa saqlanmadi', { error: String(err.message) }); }
  }

  /* Telegram'ga ham yuboramiz — ofsayt (tashqi) nusxa sifatida */
  if (db && config.backupToTelegram && signal !== 'uncaughtException') {
    try {
      const result = await Promise.race([
        sendBackupToTelegram({ force: true }),
        new Promise((resolve) => setTimeout(() => resolve({ sent: false, reason: 'vaqt tugadi' }), 8_000)),
      ]);
      log.info('to\'xtashdan oldingi zaxira: ' + (result.sent ? 'yuborildi' : result.reason || result.error));
    } catch (err) { log.warn('to\'xtashdan oldingi zaxira xatosi', { error: String(err.message) }); }
  }

  try { if (db) db.close(); } catch { /* yopilgan */ }
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
