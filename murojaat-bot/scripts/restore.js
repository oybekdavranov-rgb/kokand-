#!/usr/bin/env node
'use strict';
/* =====================================================================
   Zaxiradan tiklash:
       npm run restore -- murojaat-2026-10-21-09-00.db.gz
       npm run restore -- data/backups/murojaat-....db

   Telegram'ga yuborilgan zaxira faylini (yoki data/backups ichidagini)
   ko'rsatasiz — skript uni tekshiradi va ishchi bazaga o'rnatadi.
   Xizmat TO'XTATILGAN bo'lishi kerak.
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const Database = require('better-sqlite3');
const { config } = require('../src/config');

const source = process.argv[2];
if (!source) {
  console.error('\n  Foydalanish:  npm run restore -- <zaxira-fayli>\n');
  console.error('  Masalan:      npm run restore -- murojaat-2026-10-21-09-00.db.gz');
  console.error('  Zaxira fayllari: Telegram\'dagi dekanat chati yoki ' + path.join(config.dataDir, 'backups') + '\n');
  process.exit(1);
}
if (!fs.existsSync(source)) {
  console.error(`\n  ⛔️ Fayl topilmadi: ${source}\n`);
  process.exit(1);
}

/* 1) Kerak bo'lsa ochamiz (.gz) */
const work = path.join(os.tmpdir(), 'murojaat-restore-' + process.pid + '.db');
try {
  const raw = fs.readFileSync(source);
  const isGzip = raw[0] === 0x1f && raw[1] === 0x8b;
  fs.writeFileSync(work, isGzip ? zlib.gunzipSync(raw) : raw);
} catch (err) {
  console.error('\n  ⛔️ Faylni o\'qib bo\'lmadi: ' + err.message + '\n');
  process.exit(1);
}

/* 2) Haqiqiy SQLite bazasimi va butunmi — tekshiramiz */
let summary;
try {
  const check = new Database(work, { readonly: true });
  const integrity = check.pragma('integrity_check', { simple: true });
  if (integrity !== 'ok') throw new Error('integrity_check: ' + integrity);
  summary = {
    appeals: check.prepare('SELECT COUNT(*) AS n FROM appeals').get().n,
    users: check.prepare('SELECT COUNT(*) AS n FROM users').get().n,
    version: check.pragma('user_version', { simple: true }),
  };
  check.close();
} catch (err) {
  fs.rmSync(work, { force: true });
  console.error('\n  ⛔️ Bu fayl yaroqli zaxira emas: ' + err.message + '\n');
  process.exit(1);
}

/* 3) Mavjud bazani chetga surib qo'yamiz (yo'qotmaymiz) */
fs.mkdirSync(path.dirname(config.dbFile), { recursive: true, mode: 0o700 });
if (fs.existsSync(config.dbFile)) {
  const parked = config.dbFile + '.eski-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  fs.renameSync(config.dbFile, parked);
  console.log('  ℹ️  Eski baza saqlab qo\'yildi: ' + parked);
}
/* WAL fayllari qolsa, tiklangan bazani buzadi */
for (const suffix of ['-wal', '-shm']) {
  try { fs.rmSync(config.dbFile + suffix, { force: true }); } catch { /* yo'q */ }
}

fs.copyFileSync(work, config.dbFile);
try { fs.chmodSync(config.dbFile, 0o600); } catch { /* FS qo'llab-quvvatlamasa */ }
fs.rmSync(work, { force: true });

console.log('\n  ✅ Tiklandi: ' + config.dbFile);
console.log(`     Murojaatlar: ${summary.appeals} · Foydalanuvchilar: ${summary.users} · Sxema: v${summary.version}`);
console.log('     Endi xizmatni qayta ishga tushiring (Replit: Run / Redeploy).\n');
