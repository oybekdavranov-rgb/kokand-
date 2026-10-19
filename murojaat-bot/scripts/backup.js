#!/usr/bin/env node
'use strict';
/* =====================================================================
   Zaxira nusxa:  npm run backup
   SQLite'ning online backup API'si — server ishlab turganda ham xavfsiz.
   Oxirgi 14 nusxa saqlanadi, qolganlari o'chiriladi.
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { config } = require('../src/config');

const KEEP = Number(process.env.BACKUP_KEEP || 14);
const dir = path.join(config.dataDir, 'backups');
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
const target = path.join(dir, `murojaat-${stamp}.db`);

(async () => {
  if (!fs.existsSync(config.dbFile)) {
    console.error('⛔️ Baza fayli topilmadi:', config.dbFile);
    process.exit(1);
  }
  const db = new Database(config.dbFile, { readonly: true });
  try {
    await db.backup(target);
    fs.chmodSync(target, 0o600);
    const size = (fs.statSync(target).size / 1024 / 1024).toFixed(2);
    console.log(`✅ Zaxira: ${target} (${size} MB)`);

    const old = fs.readdirSync(dir).filter((name) => name.endsWith('.db')).sort().reverse().slice(KEEP);
    for (const name of old) {
      fs.unlinkSync(path.join(dir, name));
      console.log('   eski nusxa o\'chirildi: ' + name);
    }
  } catch (err) {
    console.error('⛔️ Zaxira xatosi:', err.message);
    process.exit(1);
  } finally {
    db.close();
  }
})();
