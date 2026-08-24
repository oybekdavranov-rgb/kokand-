#!/usr/bin/env node
/* =====================================================================
   One-shot migration: import an existing data.json into PostgreSQL.
   Requires DATABASE_URL to be set and `pg` installed (npm install pg).

   Usage:
     DATABASE_URL=postgres://... node migrate.js
     DATABASE_URL=postgres://... node migrate.js ./path/to/data.json
   ===================================================================== */
'use strict';
require('./lib/env').load();
const fs = require('fs');
const path = require('path');

(async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Nothing to migrate into.');
    process.exit(1);
  }
  const dataFile = process.argv[2] || process.env.DATA_FILE || path.join(__dirname, 'data.json');
  let doc;
  try { doc = JSON.parse(fs.readFileSync(dataFile, 'utf8')); }
  catch (e) {
    try { doc = JSON.parse(fs.readFileSync(path.join(__dirname, 'default-data.json'), 'utf8')); }
    catch (e2) { console.error('Could not read', dataFile, 'or the seed file.'); process.exit(1); }
  }

  const { hashIp } = require('./lib/auth');
  const { createPgStore } = require('./db');
  const store = createPgStore({ seed: doc, hashIp: (ip) => hashIp(ip, 'migrate'), onStats: null });

  await store.init();
  const res = await store.saveData(doc, null);
  console.log('✓ Imported', dataFile, '-> PostgreSQL (site_state v' + res.version + ').');
  await store.close();
  process.exit(0);
})().catch((e) => { console.error('Migration failed:', e.message); process.exit(1); });
