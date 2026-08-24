/* =====================================================================
   Security middleware — zero external dependency.
   Replaces `helmet` + `express-rate-limit` with small, focused
   implementations tuned for this app.
   ===================================================================== */
'use strict';

/* ---------- Security headers (helmet-lite) ----------
   CSP is intentionally permissive enough for a single-file SPA that:
     - loads Google Fonts (fonts.googleapis.com / fonts.gstatic.com)
     - uses inline <style> and inline event-free scripts in index.html
     - renders base64 (data:) images and an optional bg video
   Tighten `script-src` further once inline scripts are externalised.
*/
function securityHeaders(opts = {}) {
  const isProd = process.env.NODE_ENV === 'production';
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self' https://fonts.gstatic.com data:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    // 'unsafe-inline' kept for the bundled SPA; remove when scripts move to files
    "script-src 'self' 'unsafe-inline'",
    "connect-src 'self'",
    "object-src 'none'",
  ].join('; ');

  return function (req, res, next) {
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (isProd) {
      res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }
    res.removeHeader('X-Powered-By');
    next();
  };
}

/* ---------- In-memory rate limiter ----------
   Fixed-window counter keyed by client IP (+ optional prefix).
   NOTE: state is per-process. For multi-instance deployments move this
   to Redis. For a single Railway/VPS instance it is effective.
*/
function rateLimit({ windowMs = 60_000, max = 60, prefix = '', message = 'Too many requests' } = {}) {
  const hits = new Map(); // key -> { count, resetAt }

  // periodic cleanup so the map cannot grow unbounded
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, windowMs);
  if (timer.unref) timer.unref();

  return function (req, res, next) {
    const ip = clientIp(req);
    const key = prefix + ':' + ip;
    const now = Date.now();
    let rec = hits.get(key);
    if (!rec || rec.resetAt <= now) {
      rec = { count: 0, resetAt: now + windowMs };
      hits.set(key, rec);
    }
    rec.count++;
    const remaining = Math.max(0, max - rec.count);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil((rec.resetAt - now) / 1000)));
    if (rec.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((rec.resetAt - now) / 1000)));
      return res.status(429).json({ error: message });
    }
    next();
  };
}

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
}

module.exports = { securityHeaders, rateLimit, clientIp };
