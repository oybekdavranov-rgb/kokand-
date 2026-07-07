/* =====================================================================
   Qo'qon Universiteti — Tashkiliy tuzilma :: BACKEND
   Node.js + Express. Ma'lumot serverda (data.json) saqlanadi.
   Faqat bitta bog'liqlik: express. (token uchun Node ichki 'crypto').
   ===================================================================== */
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();

/* ---- Sozlamalar (env orqali o'zgartiring) ---- */
const PORT           = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'kokand2026';
const SECRET         = process.env.JWT_SECRET || 'ku-please-change-this-secret';
const DATA_FILE      = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const SEED_FILE      = path.join(__dirname, 'default-data.json');

/* base64 rasmlar katta bo'lishi mumkin -> limitni oshiramiz */
app.use(express.json({ limit: '30mb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

/* =====================================================================
   MA'LUMOTLAR OMBORI (oddiy JSON-fayl; SQLite/Postgres'ga oson ko'chiriladi)
   ===================================================================== */
function readData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (e) { return null; }
}
function writeData(obj) {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, DATA_FILE);           // atomik yozish (buzilishdan himoya)
}
/* birinchi ishga tushirishda standart tuzilmani yuklaymiz */
(function seed() {
  if (readData()) return;
  let def = { logo: '', bgVideo: '', depts: [] };
  try { def = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8')); } catch (e) {}
  writeData(def);
  console.log('  › data.json topilmadi — standart tuzilma yuklandi.');
})();

/* =====================================================================
   AUTENTIFIKATSIYA (HMAC bilan imzolangan token — tashqi kutubxonasiz)
   ===================================================================== */
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}
function verify(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(parts[0]).digest('base64url');
  try {
    const a = Buffer.from(parts[1]); const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const obj = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    if (obj.exp && Date.now() > obj.exp) return null;
    return obj;
  } catch (e) { return null; }
}
function requireAdmin(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.replace(/^Bearer\s+/i, '');
  if (verify(token)) return next();
  res.status(401).json({ error: 'unauthorized' });
}

/* =====================================================================
   API
   ===================================================================== */
/* Admin kirish -> token qaytaradi (30 kun) */
app.post('/api/login', (req, res) => {
  const pass = (req.body && req.body.password) || '';
  if (pass === ADMIN_PASSWORD) {
    const token = sign({ role: 'admin', exp: Date.now() + 30 * 24 * 60 * 60 * 1000 });
    return res.json({ token });
  }
  res.status(401).json({ error: 'wrong password' });
});

/* Tokenni tekshirish (frontend boot uchun) */
app.get('/api/verify', requireAdmin, (req, res) => res.json({ ok: true }));

/* Butun tuzilmani o'qish (ochiq) */
app.get('/api/data', (req, res) => {
  res.json(readData() || { logo: '', bgVideo: '', depts: [] });
});

/* Butun tuzilmani saqlash (faqat admin) */
app.put('/api/data', requireAdmin, (req, res) => {
  const body = req.body;
  if (!body || !Array.isArray(body.depts)) {
    return res.status(400).json({ error: 'bad data: depts massivi kerak' });
  }
  try { writeData(body); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: 'saqlashda xato' }); }
});

/* Standart tuzilmaga qaytarish (faqat admin) */
app.post('/api/reset', requireAdmin, (req, res) => {
  try {
    let def = { logo: '', bgVideo: '', depts: [] };
    try { def = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8')); } catch (e) {}
    writeData(def);
    res.json({ ok: true, data: def });
  } catch (e) { res.status(500).json({ error: 'reset xato' }); }
});

/* SPA fallback: boshqa yo'llar -> index.html */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('  ┌───────────────────────────────────────────────┐');
  console.log('  │  Qo\'qon Universiteti — Tuzilma backend ishga tushdi');
  console.log('  │  URL:    http://localhost:' + PORT);
  console.log('  │  Parol:  ' + (process.env.ADMIN_PASSWORD ? '(env ADMIN_PASSWORD)' : 'kokand2026'));
  console.log('  │  Ombor:  ' + DATA_FILE);
  console.log('  └───────────────────────────────────────────────┘');
});
