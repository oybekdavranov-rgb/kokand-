'use strict';
/* =====================================================================
   DOIMIY SAQLASH (Replit App Storage)

   Replit'da nashr qilingan ilovaning fayl tizimi saqlanmaydi — har
   "Publish"da tozalanadi. Shuning uchun baza nusxasi tashqi obyekt
   xotirasida saqlanadi: ishga tushishda tiklanadi, o'zgarishlardan
   keyin yangilanadi.

   Rejimlar (STORAGE_MODE):
     replit — Replit App Storage (konteyner tashqarisidagi xotira)
     local  — mahalliy papka (sinov va boshqa muhitlar uchun)
     off    — o'chirilgan (VPS'da kerak emas: u yerda disk doimiy)
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const { config } = require('./config');
const log = require('./logger');

const KEY = 'murojaat/live.db';

let adapter;          // null — o'chirilgan
let lastVersion = -1;
let busy = false;

function buildAdapter() {
  const mode = config.storageMode;
  if (mode === 'off') return null;

  if (mode === 'local') {
    const dir = config.storageDir || path.join(config.dataDir, 'snapshots');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const target = (key) => path.join(dir, key.replace(/[\/]/g, '_'));
    return {
      name: 'mahalliy papka (' + dir + ')',
      async exists(key) { return fs.existsSync(target(key)); },
      async download(key, file) { fs.copyFileSync(target(key), file); },
      async upload(key, file) { fs.copyFileSync(file, target(key)); fs.chmodSync(target(key), 0o600); },
    };
  }

  /* Replit App Storage — paket faqat Replit'da ishlaydi */
  try {
    const { Client } = require('@replit/object-storage');
    const client = new Client();
    const unwrap = (result, what) => {
      if (!result || result.ok !== false) return result;
      throw new Error(`${what}: ${result.error?.message || 'noma\'lum xato'}`);
    };
    return {
      name: 'Replit App Storage',
      async exists(key) { return unwrap(await client.exists(key), 'exists').value === true; },
      async download(key, file) { unwrap(await client.downloadToFilename(key, file), 'download'); },
      async upload(key, file) { unwrap(await client.uploadFromFilename(key, file, { compress: true }), 'upload'); },
    };
  } catch (err) {
    log.error('App Storage ulanmadi — MA\'LUMOT HIMOYALANMAGAN', { error: String(err.message) });
    log.error('Replit\'da chap paneldagi "App Storage" (Object Storage) bo\'limidan bucket yarating. Batafsil: REPLIT.md');
    return null;
  }
}

function getAdapter() {
  if (adapter === undefined) adapter = buildAdapter();
  return adapter;
}

const isEnabled = () => !!getAdapter();

/**
 * Ishga tushishda: baza fayli yo'q bo'lsa — tashqi xotiradan tiklaymiz.
 * MUHIM: bu funksiya src/db.js yuklanishidan OLDIN chaqirilishi kerak.
 * @returns {Promise<boolean>} tiklandimi
 */
async function restoreIfMissing() {
  const store = getAdapter();
  if (!store) return false;

  try {
    const exists = fs.existsSync(config.dbFile) && fs.statSync(config.dbFile).size > 0;
    if (exists) {
      log.info(`doimiy saqlash: ${store.name} (baza joyida)`);
      return false;
    }
    if (!await store.exists(KEY)) {
      log.info(`doimiy saqlash: ${store.name} — saqlangan nusxa yo'q (birinchi ishga tushish)`);
      return false;
    }
    fs.mkdirSync(path.dirname(config.dbFile), { recursive: true, mode: 0o700 });
    await store.download(KEY, config.dbFile);
    try { fs.chmodSync(config.dbFile, 0o600); } catch { /* FS qo'llab-quvvatlamasa */ }
    const sizeMb = (fs.statSync(config.dbFile).size / 1024 / 1024).toFixed(2);
    log.info(`✅ baza ${store.name} dan tiklandi (${sizeMb} MB)`);
    return true;
  } catch (err) {
    log.error('tiklash XATOSI — bo\'sh baza bilan davom etamiz', { error: String(err.message) });
    return false;
  }
}

/**
 * Bazaning joriy nusxasini tashqi xotiraga yuklaymiz.
 * O'zgarish bo'lmagan bo'lsa (PRAGMA data_version) — bekorga yuklamaymiz.
 */
async function snapshot(reason = 'interval') {
  const store = getAdapter();
  if (!store || busy) return { saved: false, reason: store ? 'band' : 'o\'chirilgan' };

  const db = require('./db');
  let version = 0;
  try { version = db.dataVersion(); } catch { /* baza yopilgan bo'lishi mumkin */ }
  if (reason === 'interval' && version === lastVersion) return { saved: false, reason: 'o\'zgarish yo\'q' };

  busy = true;
  const tmp = config.dbFile + '.snapshot';
  try {
    await db.backupTo(tmp);
    await store.upload(KEY, tmp);
    lastVersion = version;
    log.info('doimiy saqlash: nusxa yangilandi', { sabab: reason });
    return { saved: true };
  } catch (err) {
    log.error('ZAXIRA SAQLANMADI — ma\'lumot xavf ostida', { sabab: reason, error: String(err.message) });
    return { saved: false, error: String(err.message) };
  } finally {
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.rmSync(tmp + suffix, { force: true }); } catch { /* yo'q */ }
    }
    busy = false;
  }
}

module.exports = { restoreIfMissing, snapshot, isEnabled, KEY };
