/* =====================================================================
   Minimal .env loader — zero dependency (replaces `dotenv`).
   Loads KEY=VALUE lines from a .env file into process.env WITHOUT
   overwriting variables that are already set by the platform
   (Railway / Replit / systemd inject real env vars — those always win).

   Why not the `dotenv` package? To keep the project installable with
   zero external dependencies. This parser covers the common cases:
   comments (#), quoted values, and `export KEY=...` lines.
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

function parse(src) {
  const out = {};
  for (let line of src.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice(7).trim();
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    let val = line.slice(eq + 1).trim();
    // strip matching surrounding quotes
    if (val.length >= 2 &&
        ((val[0] === '"' && val[val.length - 1] === '"') ||
         (val[0] === "'" && val[val.length - 1] === "'"))) {
      val = val.slice(1, -1);
      if (src.includes('\\n')) val = val.replace(/\\n/g, '\n');
    }
    out[key] = val;
  }
  return out;
}

function load(file) {
  const target = file || path.join(process.cwd(), '.env');
  let raw;
  try { raw = fs.readFileSync(target, 'utf8'); }
  catch (e) { return false; }          // no .env — fine, use platform env
  const parsed = parse(raw);
  for (const k of Object.keys(parsed)) {
    if (process.env[k] === undefined) process.env[k] = parsed[k];
  }
  return true;
}

module.exports = { load, parse };
