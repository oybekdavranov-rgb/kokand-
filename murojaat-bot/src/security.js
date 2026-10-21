'use strict';
/* =====================================================================
   Kichik xavfsizlik yordamchilari.
   Bu botda parol, sessiya va cookie yo'q (web-panel ham yo'q), shuning
   uchun bu modul faqat matn tozalash va so'rov chegarasidan iborat.
   ===================================================================== */

/** Telegram HTML uchun qochirish — in'ektsiya va buzilgan razmetkadan himoya */
const escapeHtml = (text) => String(text ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Boshqaruv belgilarini olib tashlaydi va uzunlikni cheklaydi */
const sanitizeText = (text, maxLength = 4000) => String(text ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  .replace(/\r\n/g, '\n')
  .trim()
  .slice(0, maxLength);

/**
 * Matnni XAVFSIZ kesish: emoji (surrogate juftlik) o'rtasidan kesilmaydi.
 * Oddiy slice() yolg'iz surrogate qoldiradi — Telegram bunday matnni rad etadi.
 */
function cut(text, maxLength, suffix = '…') {
  const value = String(text ?? '');
  const chars = Array.from(value);
  if (chars.length <= maxLength) return value;
  return chars.slice(0, maxLength).join('') + suffix;
}

/** So'rov chegarasi: sirpanuvchi oyna, xotirada */
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

  check(key) {
    const now = Date.now();
    const times = (this.hits.get(key) || []).filter((t) => t > now - this.windowMs);
    if (times.length >= this.max) {
      this.hits.set(key, times);
      return { allowed: false, retryAfterMs: times[0] + this.windowMs - now };
    }
    times.push(now);
    this.hits.set(key, times);
    return { allowed: true, remaining: this.max - times.length };
  }

  stop() { clearInterval(this.timer); }
}

module.exports = { escapeHtml, sanitizeText, cut, RateLimiter };
