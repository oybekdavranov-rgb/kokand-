/* =====================================================================
   Qo'qon Universiteti — Tashkiliy tuzilma :: BACKEND
   Node.js + Express.

   Storage: JSON file by default (data.json — unchanged format), or
   PostgreSQL automatically when DATABASE_URL is set (Railway).

   Hardening & analytics are ADDITIVE — every original endpoint keeps its
   exact behavior. New: security headers, rate limiting, input validation,
   real-time view/visit/click/search analytics, admin statistics, /health.
   Zero required 3rd-party dependencies (pg is optional, loaded on demand).
   ===================================================================== */
'use strict';
require('./lib/env').load();                 // load .env if present (no-op otherwise)

const express = require('express');
const path = require('path');
const fs = require('fs');

const auth = require('./lib/auth');
const { securityHeaders, rateLimit, clientIp } = require('./lib/security');
const { validateStructure } = require('./lib/validate');
const { createStore } = require('./lib/store');

/* =====================================================================
   CONFIG + fail-fast (audit KU-01 / KU-02 / KU-15)
   ===================================================================== */
const IS_PROD = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const SEED_FILE = path.join(__dirname, 'default-data.json');
const DATA_LIMIT = process.env.DATA_LIMIT || '30mb';
const TOKEN_TTL_HOURS = parseInt(process.env.TOKEN_TTL_HOURS || '720', 10); // 30d default

function fatal(msg) { console.error('  ✗ CONFIG ERROR: ' + msg); process.exit(1); }

/* ---- signing secret ---- */
let SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  if (IS_PROD) fatal('JWT_SECRET is required in production. Set a long random string.');
  SECRET = 'ku-dev-insecure-secret-DO-NOT-USE-IN-PROD';
  console.warn('  ! JWT_SECRET not set — using an insecure DEV secret. Do NOT deploy like this.');
} else if (IS_PROD && SECRET.length < 24) {
  fatal('JWT_SECRET is too short for production (use 32+ random chars).');
}

/* ---- admin credential: prefer a hash, allow plaintext for back-compat ---- */
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
if (!ADMIN_PASSWORD_HASH && !ADMIN_PASSWORD) {
  if (IS_PROD) fatal('Set ADMIN_PASSWORD_HASH (preferred) or ADMIN_PASSWORD in production.');
  ADMIN_PASSWORD = 'kokand2026';
  console.warn('  ! No admin credential set — using the default DEV password "kokand2026".');
} else if (ADMIN_PASSWORD && !ADMIN_PASSWORD_HASH && IS_PROD) {
  console.warn('  ! Using plaintext ADMIN_PASSWORD in production. Prefer ADMIN_PASSWORD_HASH ' +
               '(generate with: npm run hash-password).');
}
function checkPassword(pass) {
  if (ADMIN_PASSWORD_HASH) return auth.verifyPassword(pass, ADMIN_PASSWORD_HASH);
  return auth.safeEqual(pass, ADMIN_PASSWORD);
}

/* =====================================================================
   SEED + STORE
   ===================================================================== */
let SEED = { logo: '', bgVideo: '', depts: [] };
try { SEED = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8')); } catch (e) {}

const store = createStore({ dataFile: DATA_FILE, seed: SEED, secret: SECRET });

/* =====================================================================
   APP + MIDDLEWARE
   ===================================================================== */
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);                 // correct client IPs behind Railway/Nginx
app.use(securityHeaders());

const smallJson = express.json({ limit: '256kb' });   // public routes
const bigJson = express.json({ limit: DATA_LIMIT });   // admin write only (KU-05)

const loginLimiter = rateLimit({ windowMs: 15 * 60_000, max: 20, prefix: 'login',
  message: 'Too many login attempts — try again later.' });
const trackLimiter = rateLimit({ windowMs: 60_000, max: 120, prefix: 'track' });
const apiLimiter = rateLimit({ windowMs: 60_000, max: 300, prefix: 'api' });

app.use('/api/', apiLimiter);

/* Serve the SPA + assets */
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

/* ---- auth guard (now checks role, audit KU-08) ---- */
function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const payload = auth.verify(token, SECRET);
  if (payload && payload.role === 'admin') { req.user = payload; return next(); }
  res.status(401).json({ error: 'unauthorized' });
}

/* =====================================================================
   CORE API  (behavior preserved from the original app)
   ===================================================================== */

/* Admin login -> token */
app.post('/api/login', loginLimiter, smallJson, (req, res) => {
  const pass = (req.body && req.body.password) || '';
  if (checkPassword(pass)) {
    const token = auth.sign(
      { role: 'admin', iat: Date.now(), exp: Date.now() + TOKEN_TTL_HOURS * 3600_000 },
      SECRET
    );
    return res.json({ token });
  }
  res.status(401).json({ error: 'wrong password' });
});

/* Verify token (frontend boot) */
app.get('/api/verify', requireAdmin, (req, res) => res.json({ ok: true }));

/* Read the whole structure (public) */
app.get('/api/data', async (req, res, next) => {
  try { res.json((await store.getData()) || { logo: '', bgVideo: '', depts: [] }); }
  catch (e) { next(e); }
});

/* Save the whole structure (admin). Optional optimistic locking via ?version / body._version */
app.put('/api/data', requireAdmin, bigJson, async (req, res, next) => {
  try {
    const { ok, data, errors } = validateStructure(req.body);
    if (!ok) return res.status(400).json({ error: 'bad data', details: errors });
    const expected = req.body && req.body._version;
    const result = await store.saveData(data, expected != null ? expected : null);
    if (result.conflict) {
      return res.status(409).json({ error: 'version conflict', version: result.version });
    }
    res.json({ ok: true, version: result.version });
  } catch (e) { next(e); }
});

/* Reset to the seed structure (admin) */
app.post('/api/reset', requireAdmin, async (req, res, next) => {
  try {
    let def = { logo: '', bgVideo: '', depts: [] };
    try { def = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8')); } catch (e) {}
    const result = await store.resetData(def);
    res.json({ ok: true, data: def, version: result.version });
  } catch (e) { next(e); }
});

/* =====================================================================
   ANALYTICS API  (new, additive)
   ===================================================================== */

/* Track a visit / view / click / search from the frontend */
app.post('/api/track', trackLimiter, smallJson, async (req, res, next) => {
  try {
    const b = req.body || {};
    const ip = clientIp(req);
    if (b.type === 'visit') {
      await store.recordVisit({ path: b.path, ip, ua: (req.headers['user-agent'] || '').slice(0, 256) });
    } else if (['view', 'click', 'search'].includes(b.type)) {
      await store.recordEvent({ type: b.type, target: b.target, query: b.query, ip });
    } else {
      return res.status(400).json({ error: 'unknown event type' });
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* Public live stats (per-card view counts + total visits) */
app.get('/api/stats/public', async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await store.getPublicStats());
  } catch (e) { next(e); }
});

/* Real-time push of public stats via Server-Sent Events */
app.get('/api/stats/stream', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  try { send(await store.getPublicStats()); } catch (e) {}
  const onStats = (s) => send(s);
  store.bus.on('stats', onStats);
  const hb = setInterval(() => res.write(': ping\n\n'), 25_000);
  if (hb.unref) hb.unref();
  req.on('close', () => { clearInterval(hb); store.bus.off('stats', onStats); });
});

/* Full statistics for the admin dashboard */
app.get('/api/stats/admin', requireAdmin, async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await store.getAdminStats());
  } catch (e) { next(e); }
});

/* =====================================================================
   HEALTH + 404 + ERRORS
   ===================================================================== */
app.get('/health', (req, res) => res.json({ ok: true, store: store.kind, uptime: process.uptime() }));

/* Unknown API routes -> JSON 404 (audit KU-18) */
app.all('/api/*', (req, res) => res.status(404).json({ error: 'not found' }));

/* Missing static assets should 404 — not fall through to the SPA
   (otherwise a missing font/image returns index.html as 200). */
app.get(/\.[a-zA-Z0-9]+$/, (req, res) => res.status(404).send('Not found'));

/* SPA fallback for everything else */
app.get('*', (req, res) => {
  const indexFile = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
  res.status(404).send('Frontend not found. Place your site in ./public/index.html');
});

/* Central error handler (audit KU-16) */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'payload too large' });
  if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: 'invalid JSON' });
  console.error('  ! error:', err && err.message);
  res.status(500).json({ error: 'internal error' });
});

/* =====================================================================
   BOOT
   ===================================================================== */
(async function boot() {
  try {
    await store.init();
  } catch (e) {
    fatal('storage init failed: ' + e.message);
  }
  const server = app.listen(PORT, () => {
    console.log('  ┌───────────────────────────────────────────────┐');
    console.log("  │  Qo'qon Universiteti — Tuzilma backend ishga tushdi");
    console.log('  │  URL:    http://localhost:' + PORT);
    console.log('  │  Store:  ' + store.kind + (store.kind === 'file' ? ('  (' + DATA_FILE + ')') : ''));
    console.log('  │  Admin:  ' + (ADMIN_PASSWORD_HASH ? 'hashed password (env)' :
                (process.env.ADMIN_PASSWORD ? 'plaintext password (env)' : 'DEV default')));
    console.log('  │  Env:    ' + (IS_PROD ? 'production' : 'development'));
    console.log('  └───────────────────────────────────────────────┘');
  });
  const shutdown = () => {
    console.log('\n  › shutting down…');
    server.close(() => { try { store.close && store.close(); } catch (e) {} process.exit(0); });
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
})();
