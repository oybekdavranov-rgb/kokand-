/* =====================================================================
   Authentication helpers — zero external dependency (Node `crypto`).

   - Stateless token: base64url(payload).base64url(HMAC-SHA256 sig)
     (the original scheme, preserved for backward compatibility).
   - Password hashing with scrypt (so the admin password is never stored
     in plaintext). Format:  scrypt$<N>$<saltB64>$<hashB64>
   - Constant-time comparisons everywhere to avoid timing side-channels.
   ===================================================================== */
'use strict';
const crypto = require('crypto');

/* ---------- Tokens ---------- */
function sign(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return body + '.' + sig;
}

function verify(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac('sha256', secret).update(parts[0]).digest('base64url');
  try {
    const a = Buffer.from(parts[1]);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const obj = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    if (obj.exp && Date.now() > obj.exp) return null;
    return obj;
  } catch (e) { return null; }
}

/* ---------- Password hashing (scrypt) ---------- */
const SCRYPT_N = 16384; // CPU/memory cost

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 32, { N: SCRYPT_N });
  return `scrypt$${SCRYPT_N}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  try {
    const [scheme, n, saltB64, hashB64] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const got = crypto.scryptSync(String(password), salt, expected.length, { N: parseInt(n, 10) });
    return got.length === expected.length && crypto.timingSafeEqual(got, expected);
  } catch (e) { return false; }
}

/* Constant-time compare for a raw (unhashed) shared secret — fallback path. */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) {
    // still burn time to reduce length leakage
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

/* One-way hash for privacy-preserving IP storage (no raw IPs kept). */
function hashIp(ip, secret) {
  return crypto.createHmac('sha256', secret).update(String(ip || '')).digest('hex').slice(0, 16);
}

module.exports = { sign, verify, hashPassword, verifyPassword, safeEqual, hashIp };
