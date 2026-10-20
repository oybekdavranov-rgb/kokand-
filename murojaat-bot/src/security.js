'use strict';
/* =====================================================================
   Xavfsizlik yordamchilari: parol hash (scrypt), vaqt-xavfsiz
   taqqoslash, sessiya tokenlari, TOTP (2 qadamli kirish), so'rov
   chegarasi (rate limit), cookie va HTML qochirish.
   Tashqi kutubxona ishlatilmaydi — faqat Node'ning 'crypto' moduli.
   ===================================================================== */
const crypto = require('crypto');
const { promisify } = require('util');

const scryptAsync = promisify(crypto.scrypt);

/* ---- Parol: scrypt (OWASP tavsiyasi) ---- */
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64, maxmem: 128 * 1024 * 1024 };

/* Bo'luvchi sifatida "." ishlatiladi: "$" belgisi .env va docker-compose
   kabi muhitlarda o'zgaruvchi deb talqin qilinib, hashni buzib qo'yadi.
   Eski ("$" bilan yozilgan) hashlar ham o'qilaveradi. */
const HASH_PATTERN = /^scrypt[.$]\d+[.$]\d+[.$]\d+[.$][A-Za-z0-9_-]+[.$][A-Za-z0-9_-]+$/;

function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('Parol kamida 8 belgi bo\'lishi kerak');
  }
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64url'), hash.toString('base64url')].join('.');
}

function parseHash(stored) {
  const [scheme, N, r, p, saltB64, hashB64] = String(stored).split(/[.$]/);
  if (scheme !== 'scrypt') return null;
  return {
    params: { N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem },
    salt: Buffer.from(saltB64, 'base64url'),
    expected: Buffer.from(hashB64, 'base64url'),
  };
}

function verifyPassword(password, stored) {
  try {
    if (typeof password !== 'string' || typeof stored !== 'string') return false;
    const parsed = parseHash(stored);
    if (!parsed) return false;
    const actual = crypto.scryptSync(password, parsed.salt, parsed.expected.length, parsed.params);
    return actual.length === parsed.expected.length && crypto.timingSafeEqual(actual, parsed.expected);
  } catch {
    return false;
  }
}

/* --- Asinxron variantlar ---
   scrypt ataylab "qimmat" (≈100 ms). Sinxron chaqiruv Node'ning yagona ipini
   bloklaydi: login so'rovlari ko'paysa, panel ham, Telegram webhook ham
   javob bermay qoladi. Shuning uchun so'rov ichida FAQAT shular ishlatiladi. */
async function hashPasswordAsync(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('Parol kamida 8 belgi bo\'lishi kerak');
  }
  const salt = crypto.randomBytes(16);
  const hash = await scryptAsync(password, salt, SCRYPT.keylen, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64url'), hash.toString('base64url')].join('.');
}

async function verifyPasswordAsync(password, stored) {
  try {
    if (typeof password !== 'string' || typeof stored !== 'string') return false;
    const parsed = parseHash(stored);
    if (!parsed) return false;
    const actual = await scryptAsync(password, parsed.salt, parsed.expected.length, parsed.params);
    return actual.length === parsed.expected.length && crypto.timingSafeEqual(actual, parsed.expected);
  } catch {
    return false;
  }
}

/* ---- Vaqt-xavfsiz satr taqqoslash (timing attack'ga qarshi) ---- */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ''), 'utf8');
  const bufB = Buffer.from(String(b ?? ''), 'utf8');
  if (bufA.length !== bufB.length) {
    /* uzunlik farq qilsa ham bir xil vaqt ketishi uchun "soxta" taqqoslash */
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
/* IP va User-Agent'lar ochiq saqlanmaydi: faqat kalitlangan hash (maxfiylik) */
const keyedHash = (value, secret) => crypto.createHmac('sha256', secret).update(String(value ?? '')).digest('hex').slice(0, 32);

/* ---- TOTP (RFC 6238) — ixtiyoriy 2 qadamli kirish ---- */
function base32Decode(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = String(input).toUpperCase().replace(/[=\s-]/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) throw new Error('base32: noto\'g\'ri belgi');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

function totpCode(secretBase32, counter) {
  const key = base32Decode(secretBase32);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}

/* ±1 oyna (30 soniya) — soat farqiga chidamli */
function verifyTotp(secretBase32, code, window = 1) {
  if (!secretBase32) return true;                 // 2FA yoqilmagan
  const clean = String(code || '').replace(/\D/g, '');
  if (clean.length !== 6) return false;
  const counter = Math.floor(Date.now() / 30000);
  for (let i = -window; i <= window; i++) {
    try { if (safeEqual(totpCode(secretBase32, counter + i), clean)) return true; } catch { return false; }
  }
  return false;
}

const generateTotpSecret = () => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = crypto.randomBytes(20);
  return Array.from(bytes, (b) => alphabet[b % 32]).join('');
};

/* ---- So'rov chegarasi: sirpanuvchi oyna, xotirada ---- */
class RateLimiter {
  constructor({ windowMs, max, name = 'limit' }) {
    this.windowMs = windowMs;
    this.max = max;
    this.name = name;
    this.hits = new Map();
    this.timer = setInterval(() => this.cleanup(), Math.min(windowMs, 60_000));
    this.timer.unref?.();
  }

  cleanup() {
    const cutoff = Date.now() - this.windowMs;
    for (const [key, times] of this.hits) {
      const kept = times.filter((t) => t > cutoff);
      if (kept.length) this.hits.set(key, kept); else this.hits.delete(key);
    }
  }

  /** @returns {{allowed:boolean, remaining:number, retryAfterMs:number}} */
  check(key) {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const times = (this.hits.get(key) || []).filter((t) => t > cutoff);
    if (times.length >= this.max) {
      this.hits.set(key, times);
      return { allowed: false, remaining: 0, retryAfterMs: times[0] + this.windowMs - now };
    }
    times.push(now);
    this.hits.set(key, times);
    return { allowed: true, remaining: this.max - times.length, retryAfterMs: 0 };
  }

  reset(key) { this.hits.delete(key); }
  stop() { clearInterval(this.timer); }
}

/* ---- Cookie ---- */
function serializeCookie(name, value, opts = {}) {
  const parts = [`${name}=${value}`];
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(opts.maxAge)}`);
  parts.push(`Path=${opts.path || '/'}`);
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  parts.push(`SameSite=${opts.sameSite || 'Strict'}`);
  return parts.join('; ');
}

function parseCookies(header) {
  const out = Object.create(null);
  if (!header) return out;
  for (const pair of String(header).split(';')) {
    const eq = pair.indexOf('=');
    if (eq < 1) continue;
    const key = pair.slice(0, eq).trim();
    if (!key || key in out) continue;
    out[key] = pair.slice(eq + 1).trim();
  }
  return out;
}

/* ---- Telegram HTML uchun qochirish (XSS/injection oldini oladi) ---- */
const escapeHtml = (text) => String(text ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ---- Boshqaruv belgilarini tozalash (log/CSV injection oldini oladi) ---- */
const sanitizeText = (text, maxLength = 4000) => String(text ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  .replace(/\r\n/g, '\n')
  .trim()
  .slice(0, maxLength);

/**
 * Matnni XAVFSIZ kesish: emoji (surrogate juftlik) o'rtasidan kesilmaydi.
 * String.slice() yolg'iz surrogate qoldirishi mumkin — Telegram bunday matnni
 * "strings must be encoded in UTF-8" deb rad etadi.
 */
function cut(text, maxLength, suffix = '…') {
  const value = String(text ?? '');
  const chars = Array.from(value);           // kod nuqtalari bo'yicha
  if (chars.length <= maxLength) return value;
  return chars.slice(0, maxLength).join('') + suffix;
}

module.exports = {
  HASH_PATTERN, hashPassword, verifyPassword, hashPasswordAsync, verifyPasswordAsync, safeEqual, randomToken, sha256, keyedHash, cut,
  verifyTotp, totpCode, generateTotpSecret, base32Decode,
  RateLimiter, serializeCookie, parseCookies, escapeHtml, sanitizeText,
};
