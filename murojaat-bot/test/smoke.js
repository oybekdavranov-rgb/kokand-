#!/usr/bin/env node
'use strict';
/* =====================================================================
   Uchdan-uchiga tekshiruv (npm test).
   Haqiqiy Telegram'ga ulanmaydi: soxta Bot API serveri ko'tariladi va
   bot'ga webhook orqali "update"lar yuboriladi. So'ng admin panel API'si
   tekshiriladi: kirish, CSRF, javob yuborish, chegaralar, xavfsizlik.
   ===================================================================== */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { totpCode } = require('../src/security');
const Database = require('better-sqlite3');

const BOT_TOKEN = '123456789:TEST-TOKEN-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const WEBHOOK_SECRET = crypto.randomBytes(24).toString('hex');
const SESSION_SECRET = crypto.randomBytes(32).toString('hex');
const ADMIN_PASSWORD = 'TestAdminParol2026';
const UA = 'smoke-test/1.0';

const WEBHOOK_PATH = '/tg/' + crypto.createHmac('sha256', WEBHOOK_SECRET).update(BOT_TOKEN).digest('hex').slice(0, 32);

let passed = 0;
const failures = [];
function check(name, condition, detail = '') {
  if (condition) { passed++; console.log('  ✅ ' + name); }
  else { failures.push(name + (detail ? ' → ' + detail : '')); console.log('  ❌ ' + name + (detail ? ' → ' + detail : '')); }
}
const section = (title) => console.log('\n── ' + title + ' ' + '─'.repeat(Math.max(0, 58 - title.length)));

/* ===================== Soxta Telegram Bot API ======================= */
const sent = [];        // yuborilgan xabarlar
const apiCalls = [];    // chaqirilgan Bot API metodlari
const documents = [];   // yuborilgan fayllar (zaxira)
let messageId = 1000;

function mockApi() {
  return http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks);
      const method = req.url.split('/').pop();
      apiCalls.push(method);

      /* Fayl yuborish — multipart/form-data, JSON emas */
      if (method === 'sendDocument') {
        const text = rawBody.toString('latin1');
        /* grammY fayl nomini tirnoqsiz yuboradi: filename=murojaat-....db.gz */
        const fileName = (/filename="?([^";\r\n]+)"?/.exec(text) || [])[1] || '';
        const chatId = (/name="chat_id"\r\n\r\n([^\r]+)/.exec(text) || [])[1] || '';
        const caption = (/name="caption"\r\n\r\n([\s\S]*?)\r\n--/.exec(text) || [])[1] || '';
        documents.push({ chat_id: chatId, fileName, caption, size: rawBody.length });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, result: { message_id: ++messageId, document: { file_name: fileName } } }));
        return;
      }

      let body = {};
      try { body = rawBody.length ? JSON.parse(rawBody.toString() || '{}') : {}; } catch { body = {}; }

      if (req.url.includes('/file/bot')) {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        res.end('FAKE-FILE-CONTENT');
        return;
      }

      const reply = (result) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, result }));
      };

      switch (method) {
        case 'getMe':
          return reply({ id: 42, is_bot: true, first_name: 'Murojaat', username: 'murojaat_test_bot', can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false });
        case 'sendMessage': {
          if (String(body.chat_id) === '910') {      // uchinchi bo'lakdan boshlab chegara
            const seen = (sent.filter((m) => String(m.chat_id) === '910').length);
            if (seen >= 2) {
              res.writeHead(429, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error_code: 429, description: 'Too Many Requests: retry after 0', parameters: { retry_after: 0 } }));
              return;
            }
          }
          if (String(body.chat_id) === '909') {      // "bot bloklangan" holatini taqlid qilamiz
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' }));
            return;
          }
          const id = ++messageId;
          sent.push({ ...body, _messageId: id });
          return reply({ message_id: id, date: Math.floor(Date.now() / 1000), chat: { id: body.chat_id, type: 'private' }, text: body.text });
        }
        case 'getFile':
          return reply({ file_id: body.file_id, file_unique_id: 'u', file_size: 17, file_path: 'photos/test.jpg' });
        default:
          return reply(true);
      }
    });
  });
}

/* =========================== Yordamchilar =========================== */
const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));

let cookie = '';
let csrf = '';
let BASE = '';

async function request(pathname, { method = 'GET', body, headers = {}, withCsrf = true, ua = UA } = {}) {
  const init = {
    method,
    headers: { 'User-Agent': ua, Accept: 'application/json', ...headers },
    redirect: 'manual',
  };
  if (cookie) init.headers.Cookie = cookie;
  if (withCsrf && csrf && method !== 'GET') init.headers['X-CSRF-Token'] = csrf;
  if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }

  const response = await fetch(BASE + pathname, init);
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* matn */ }
  return { status: response.status, headers: response.headers, json, text };
}

let updateId = 1;
let photo = null;
const sendUpdate = (update, secret = WEBHOOK_SECRET) =>
  fetch(BASE + WEBHOOK_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret },
    body: JSON.stringify({ update_id: updateId++, ...update }),
  });

const textUpdate = (text, user = { id: 777, first_name: 'Ali', username: 'ali_test' }, extra = {}) => ({
  message: {
    message_id: ++messageId, date: Math.floor(Date.now() / 1000),
    chat: { id: user.id, type: 'private' },
    from: { is_bot: false, ...user },
    text, ...extra,
  },
});

/* Haqiqiy Telegram buyruqni "bot_command" entity bilan yuboradi */
const commandUpdate = (text, user) => textUpdate(text, user, {
  entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }],
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ============================== TEST ================================ */
(async function run() {
  const api = mockApi();
  const apiPort = await listen(api);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'murojaat-test-'));

  const env = {
    ...process.env,
    NODE_ENV: 'development',
    LOG_LEVEL: 'warn',
    PORT: '0',
    HOST: '127.0.0.1',
    DATA_DIR: dataDir,
    BOT_TOKEN,
    BOT_API_ROOT: `http://127.0.0.1:${apiPort}`,
    BOT_MODE: 'webhook',
    WEBHOOK_SECRET,
    SESSION_SECRET,
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD,
    REQUIRE_HTTPS: 'false',
    NOTIFY_CHAT_IDS: '999,998',
    APPEAL_MIN_LENGTH: '12',
    APPEALS_PER_HOUR: '3',
    APPEALS_PER_DAY: '5',
    APPEAL_COOLDOWN_SECONDS: '0',
    ENV_FILE: path.join(dataDir, 'no-env'),
  };

  /* Erkin portni oldindan topamiz (PORT=0 bo'lsa manzilni bilmaymiz) */
  const probe = http.createServer();
  const appPort = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  env.PORT = String(appPort);
  env.PUBLIC_URL = `http://127.0.0.1:${appPort}`;
  BASE = env.PUBLIC_URL;

  const child = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const logs = [];
  child.stdout.on('data', (chunk) => logs.push(chunk.toString()));
  child.stderr.on('data', (chunk) => logs.push(chunk.toString()));
  child.on('exit', (code) => { if (code && code !== 0) logs.push(`\n[child exited ${code}]`); });

  const stop = async () => { child.kill('SIGTERM'); await sleep(300); child.kill('SIGKILL'); await new Promise((r) => api.close(r)); };

  /* Server ko'tarilishini kutamiz */
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    try { const res = await fetch(BASE + '/healthz'); ready = res.ok; } catch { await sleep(200); }
  }
  if (!ready) {
    console.error('\n⛔️ Server ishga tushmadi. Log:\n' + logs.join(''));
    await stop();
    process.exit(1);
  }

  try {
    /* ---------------------------------------------------------------- */
    section('Server va xavfsizlik sarlavhalari');
    const health = await request('/healthz');
    check('healthz javob beradi', health.status === 200 && health.json.ok === true);

    const page = await fetch(BASE + '/', { headers: { 'User-Agent': UA } });
    const csp = page.headers.get('content-security-policy') || '';
    check('CSP sarlavhasi bor va qat\'iy', csp.includes("default-src 'none'") && csp.includes("frame-ancestors 'none'"), csp.slice(0, 60));
    check('nosniff + DENY + no-referrer',
      page.headers.get('x-content-type-options') === 'nosniff' &&
      page.headers.get('x-frame-options') === 'DENY' &&
      page.headers.get('referrer-policy') === 'no-referrer');
    check('X-Powered-By yashirilgan', !page.headers.get('x-powered-by'));
    check('panel indekslanmaydi', (page.headers.get('x-robots-tag') || '').includes('noindex'));

    section('Avtorizatsiyasiz kirish mumkin emas');
    check('GET /api/appeals → 401', (await request('/api/appeals')).status === 401);
    check('GET /api/stats → 401', (await request('/api/stats')).status === 401);
    check('GET /api/audit → 401', (await request('/api/audit')).status === 401);
    check('mavjud bo\'lmagan API → 404 JSON', (await request('/api/yoq')).status === 404);

    section('Webhook himoyasi');
    check('maxfiy sarlavhasiz webhook → 401', (await sendUpdate(textUpdate('salom'), 'wrong-secret')).status === 401);
    const noHeader = await fetch(BASE + WEBHOOK_PATH, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"update_id":1}' });
    check('sarlavha umuman yo\'q → 401', noHeader.status === 401);
    check('noto\'g\'ri yo\'l → webhook ishlamaydi', (await fetch(BASE + '/tg/aaaa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status !== 200);

    section('Bot: murojaat qabul qilish (kategoriyasiz)');
    sent.length = 0;
    await sendUpdate(commandUpdate('/start'));
    await sleep(200);
    check('/start → salomlashish xabari', sent.some((m) => String(m.text).includes('murojaat boti')), JSON.stringify(sent).slice(0, 120));

    sent.length = 0;
    await sendUpdate(textUpdate('/yordam'));          // entity'siz — zaxira yo'l
    await sleep(150);
    check('/yordam entity\'siz ham ishlaydi', sent.some((m) => String(m.text).includes('Qanday ishlaydi')));

    sent.length = 0;
    await sendUpdate(commandUpdate('/nomalum'));
    await sleep(150);
    check('noma\'lum buyruq → tushuntirish', sent.some((m) => String(m.text).includes('Bunday buyruq')));

    sent.length = 0;
    await sendUpdate(textUpdate('qisqa'));
    await sleep(120);
    check('juda qisqa matn murojaat sifatida qabul qilinmaydi', sent.some((m) => String(m.text).includes('kamida')));

    sent.length = 0;
    await sendUpdate(textUpdate('Dars jadvalida xatolik bor, 3-kurs uchun ikki fan ustma-ust qo\'yilgan.'));
    await sleep(200);
    const confirm = sent.find((m) => String(m.text).includes('qabul qilindi'));
    check('murojaat saqlandi va raqam berildi', !!confirm && /MR-\d{4}-\d{4}/.test(confirm.text), confirm ? '' : JSON.stringify(sent).slice(0, 120));
    check('dekanat chatiga xabarnoma ketdi', sent.some((m) => String(m.chat_id) === '999' && String(m.text).includes('Yangi murojaat')));

    /* XSS/HTML injection sinovi */
    sent.length = 0;
    await sendUpdate(textUpdate('<script>alert(1)</script> va <b>html</b> bilan murojaat matni', { id: 778, first_name: '<img src=x onerror=alert(1)>', username: 'xss_test' }));
    await sleep(200);
    check('HTML/XSS matnli murojaat xatosiz qabul qilindi', sent.some((m) => String(m.text).includes('qabul qilindi')));

    /* Fayl bilan murojaat */
    sent.length = 0;
    await sendUpdate({
      message: {
        message_id: ++messageId, date: Math.floor(Date.now() / 1000),
        chat: { id: 779, type: 'private' }, from: { id: 779, is_bot: false, first_name: 'Dilnoza' },
        caption: 'Imtihon natijasi bilan bog\'liq murojaat, ilova qilaman.',
        photo: [
          { file_id: 'small_1', file_unique_id: 'us1', width: 90, height: 90, file_size: 900 },
          { file_id: 'big_1', file_unique_id: 'ub1', width: 1280, height: 720, file_size: 45000 },
        ],
      },
    });
    await sleep(200);
    check('rasm + izoh → murojaat + ilova', sent.some((m) => String(m.text).includes('Ilova: 1 ta fayl') || String(m.text).includes('qabul qilindi')));

    sent.length = 0;
    await sendUpdate(commandUpdate('/murojaatlarim', { id: 777, first_name: 'Ali', username: 'ali_test' }));
    await sleep(150);
    const myList = sent.find((m) => String(m.text).includes('murojaatlaringiz'));
    check('/murojaatlarim o\'z murojaatlarini ko\'rsatadi', !!myList && /MR-\d{4}-\d{4}/.test(myList.text));

    const codeMatch = myList && /MR-\d{4}-\d{4}/.exec(myList.text);
    sent.length = 0;
    await sendUpdate(commandUpdate('/holat ' + codeMatch[0], { id: 777, first_name: 'Ali' }));
    await sleep(150);
    check('/holat o\'z murojaati holatini beradi', sent.some((m) => String(m.text).includes(codeMatch[0]) && String(m.text).includes('Holati')));

    sent.length = 0;
    await sendUpdate(commandUpdate('/holat ' + codeMatch[0], { id: 991, first_name: 'Begona' }));
    await sleep(150);
    check('boshqa odamning murojaatini raqam bilan ko\'rish mumkin emas', sent.some((m) => String(m.text).includes('topilmadi')));

    section('Spam/flood chegaralari');
    sent.length = 0;
    for (let i = 0; i < 4; i++) {
      await sendUpdate(textUpdate(`Takroriy murojaat matni raqami ${i} — chegara sinovi.`, { id: 780, first_name: 'Spam' }));
      await sleep(60);
    }
    check('soatlik chegara ishlaydi', sent.some((m) => String(m.text).includes('chegarasiga yetdingiz')));

    section('Admin panel: kirish');
    const badLogin = await request('/api/login', { method: 'POST', body: { username: 'admin', password: 'xato-parol' } });
    check('xato parol → 401', badLogin.status === 401 && badLogin.json.error === 'bad_credentials');
    const badUser = await request('/api/login', { method: 'POST', body: { username: 'yoq-odam', password: 'xato' } });
    check('mavjud bo\'lmagan login → bir xil javob (enumeration yo\'q)', badUser.status === 401 && badUser.json.error === 'bad_credentials');

    const login = await request('/api/login', { method: 'POST', body: { username: 'admin', password: ADMIN_PASSWORD } });
    csrf = login.json && login.json.csrf;
    check('to\'g\'ri parol → kirish + CSRF token', login.status === 200 && !!csrf && login.json.user.role === 'owner');
    check('cookie HttpOnly va SameSite=Strict',
      (login.headers.get('set-cookie') || '').includes('HttpOnly') && (login.headers.get('set-cookie') || '').includes('SameSite=Strict'));

    const me = await request('/api/me');
    check('/api/me ma\'lumot qaytaradi', me.status === 200 && me.json.user.username === 'admin' && !!me.json.office.dean);

    section('Admin panel: murojaatlar');
    const list = await request('/api/appeals?limit=50');
    check('murojaatlar ro\'yxati keldi', list.status === 200 && list.json.total >= 4, 'total=' + (list.json && list.json.total));
    const appeal = list.json.rows.find((row) => row.body.includes('Dars jadvalida'));
    check('murojaat matni o\'zgarmagan holda saqlangan', !!appeal);
    const xssRow = list.json.rows.find((row) => row.body.includes('<script>'));
    check('XSS matni JSON\'da xavfsiz qaytadi', !!xssRow && xssRow.body.includes('<script>alert(1)</script>'));

    const search = await request('/api/appeals?search=' + encodeURIComponent('jadvalida'));
    check('qidiruv ishlaydi', search.status === 200 && search.json.total === 1);
    const sqlTry = await request('/api/appeals?search=' + encodeURIComponent("' OR 1=1 --"));
    check('SQL injection urinishi natija bermaydi', sqlTry.status === 200 && sqlTry.json.total === 0);
    const filtered = await request('/api/appeals?status=new');
    check('holat bo\'yicha filtr', filtered.status === 200 && filtered.json.rows.every((row) => row.status === 'new'));

    const detail = await request('/api/appeals/' + appeal.id);
    check('murojaat tafsiloti (muallif, ilova, javoblar)', detail.status === 200 && detail.json.author.tgId === 777 && Array.isArray(detail.json.attachments));

    section('CSRF himoyasi');
    const noCsrf = await request(`/api/appeals/${appeal.id}/status`, { method: 'POST', body: { status: 'closed' }, withCsrf: false });
    check('CSRF tokensiz o\'zgartirish → 403', noCsrf.status === 403 && noCsrf.json.error === 'bad_csrf');
    const badOrigin = await request(`/api/appeals/${appeal.id}/status`, { method: 'POST', body: { status: 'closed' }, headers: { Origin: 'https://evil.example' } });
    check('begona Origin → 403', badOrigin.status === 403 && badOrigin.json.error === 'bad_origin');

    section('Javob yuborish va holat');
    sent.length = 0;
    const reply = await request(`/api/appeals/${appeal.id}/reply`, { method: 'POST', body: { body: 'Xatolik tuzatildi, jadval yangilandi. Rahmat.' } });
    check('javob yuborildi', reply.status === 200 && reply.json.appeal.status === 'answered');
    const delivered = sent.find((m) => String(m.chat_id) === '777');
    check('javob foydalanuvchiga Telegram orqali ketdi', !!delivered && String(delivered.text).includes('Dekanat javobi') && String(delivered.text).includes(appeal.code));

    const badStatus = await request(`/api/appeals/${appeal.id}/status`, { method: 'POST', body: { status: 'nonsense' } });
    check('noto\'g\'ri status → 400', badStatus.status === 400);
    const okStatus = await request(`/api/appeals/${appeal.id}/status`, { method: 'POST', body: { status: 'closed' } });
    check('holatni o\'zgartirish ishlaydi', okStatus.status === 200 && okStatus.json.appeal.status === 'closed');

    section('Ilova (fayl) yuklab olish');
    const withFile = (await request('/api/appeals?limit=50')).json.rows.find((row) => row.attachmentsCount > 0);
    const fileDetail = await request('/api/appeals/' + withFile.id);
    const attachmentId = fileDetail.json.attachments[0].id;
    const download = await fetch(`${BASE}/api/attachments/${attachmentId}`, { headers: { Cookie: cookie, 'User-Agent': UA } });
    const fileBody = await download.text();
    check('fayl server orqali yuklanadi', download.status === 200 && fileBody === 'FAKE-FILE-CONTENT');
    check('fayl brauzerda bajarilmaydi (octet-stream + attachment)',
      download.headers.get('content-type') === 'application/octet-stream' &&
      (download.headers.get('content-disposition') || '').startsWith('attachment'));
    const noAuthFile = await fetch(`${BASE}/api/attachments/${attachmentId}`);
    check('avtorizatsiyasiz fayl olinmaydi', noAuthFile.status === 401);

    section('CSV eksport');
    const csvResponse = await fetch(BASE + '/api/export.csv', { headers: { Cookie: cookie, 'User-Agent': UA } });
    const csvBytes = Buffer.from(await csvResponse.arrayBuffer());
    const csv = { status: csvResponse.status, text: csvBytes.toString('utf8') };
    check('CSV yuklandi va Excel uchun BOM bor',
      csv.status === 200 && csv.text.includes(appeal.code) && csvBytes[0] === 0xEF && csvBytes[1] === 0xBB && csvBytes[2] === 0xBF,
      `status=${csv.status} bom=${csvBytes.subarray(0, 3).toString('hex')}`);
    check('CSV sarlavhalari to\'g\'ri (text/csv + attachment)',
      (csvResponse.headers.get('content-type') || '').includes('text/csv') &&
      (csvResponse.headers.get('content-disposition') || '').includes('attachment'));
    sent.length = 0;
    await sendUpdate(textUpdate('=cmd|calc!A1 formula injection sinovi uchun matn', { id: 781, first_name: 'Formula' }));
    await sleep(150);
    const csv2 = await request('/api/export.csv');
    check('CSV formula injection neytrallangan', csv2.text.includes('"\'=cmd|calc!A1'), csv2.text.split('\n').find((l) => l.includes('cmd|calc')) || '');

    section('Ichki izohlar (dekanat uchun)');
    sent.length = 0;
    const note = await request(`/api/appeals/${appeal.id}/notes`, { method: 'POST', body: { body: 'O\'quv bo\'limiga yuborildi, javobni kutyapmiz.' } });
    check('izoh qo\'shildi', note.status === 200 && note.json.note.author === 'admin');
    check('izoh foydalanuvchiga YUBORILMAYDI', sent.length === 0, 'yuborilgan xabarlar: ' + sent.length);
    const withNote = await request('/api/appeals/' + appeal.id);
    check('izoh tafsilotda ko\'rinadi', withNote.json.notes.length === 1 && withNote.json.notes[0].body.includes('o\'quv bo\'limiga') === false && withNote.json.notes[0].body.includes('O\'quv bo\'limiga'));
    const listWithNotes = await request('/api/appeals?limit=50');
    check('ro\'yxatda izoh soni ko\'rinadi', listWithNotes.json.rows.find((r) => r.id === appeal.id).notesCount === 1);
    const emptyNote = await request(`/api/appeals/${appeal.id}/notes`, { method: 'POST', body: { body: ' ' } });
    check('bo\'sh izoh qabul qilinmaydi', emptyNote.status === 400);

    section('Muallifning oldingi murojaatlari');
    const history = await request('/api/appeals/' + appeal.id);
    check('muallif tarixi qaytadi', Array.isArray(history.json.authorHistory));
    check('tarixda shu murojaatning o\'zi yo\'q', history.json.authorHistory.every((h) => h.id !== appeal.id));
    check('muallif murojaatlari soni bor', typeof history.json.author.appeals === 'number' && history.json.author.appeals >= 1);

    section('«Ko\'rib chiqilmoqda» xabarnomasi');
    const fresh = (await request('/api/appeals?status=new&limit=1')).json.rows[0];
    sent.length = 0;
    await request(`/api/appeals/${fresh.id}/status`, { method: 'POST', body: { status: 'in_progress' } });
    await sleep(250);
    check('muallifga «ko\'rib chiqilmoqda» xabari ketdi',
      sent.some((m) => String(m.chat_id) === String(fresh.tgId) && String(m.text).includes('ko\'rib chiqilmoqda')),
      JSON.stringify(sent).slice(0, 150));
    sent.length = 0;
    await request(`/api/appeals/${fresh.id}/status`, { method: 'POST', body: { status: 'new' } });
    await request(`/api/appeals/${fresh.id}/status`, { method: 'POST', body: { status: 'in_progress' } });
    await sleep(250);
    check('xabar faqat BIR marta yuboriladi (takrorlanmaydi)', !sent.some((m) => String(m.text).includes('ko\'rib chiqilmoqda')));

    section('Kechikkan murojaatlar va sana filtri');
    /* Bitta murojaatni "eski" qilib qo'yamiz (3 kun oldin) */
    const direct = new Database(path.join(dataDir, 'murojaat.db'));
    const threeDaysAgo = Date.now() - 3 * 24 * 3600_000;
    direct.prepare('UPDATE appeals SET created_at = ?, status = ? WHERE id = ?').run(threeDaysAgo, 'new', fresh.id);
    direct.close();
    const overdue = await request('/api/appeals?overdue=1');
    check('kechikkanlar filtri ishlaydi', overdue.status === 200 && overdue.json.rows.length >= 1 && overdue.json.rows.every((r) => ['new', 'in_progress'].includes(r.status)));
    check('kechikkan murojaat ro\'yxatda', overdue.json.rows.some((r) => r.id === fresh.id));
    const statsNow = await request('/api/stats');
    check('statistikada kechikkanlar soni bor', typeof statsNow.json.overdue === 'number' && statsNow.json.overdue >= 1);

    const todayLocal = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
    const todayOnly = await request(`/api/appeals?from=${todayLocal}&to=${todayLocal}`);
    check('sana oralig\'i filtri ishlaydi (bugun)', todayOnly.status === 200 && todayOnly.json.rows.every((r) => r.id !== fresh.id));
    const badDate = await request('/api/appeals?from=keraksiz-matn');
    check('noto\'g\'ri sana e\'tiborsiz qoldiriladi', badDate.status === 200);
    const csvFiltered = await request('/api/export.csv?overdue=1');
    check('CSV ham filtrni qo\'llaydi', csvFiltered.status === 200 && csvFiltered.text.includes(fresh.code));

    section('Qidiruvda % va _ belgilari (LIKE ESCAPE)');
    sent.length = 0;
    await sendUpdate(textUpdate('Stipendiya 100% to\'landi deb aytishdi, lekin kelmadi.', { id: 801, first_name: 'Foiz' }));
    await sleep(200);
    const pctSearch = await request('/api/appeals?search=' + encodeURIComponent('100%'));
    check('"100%" qidiruvi aniq natija beradi', pctSearch.json.total === 1 && pctSearch.json.rows[0].body.includes('100%'));
    const wildcard = await request('/api/appeals?search=' + encodeURIComponent('%'));
    check('"%" joker sifatida ishlamaydi', wildcard.json.total === 1);
    const underscore = await request('/api/appeals?search=' + encodeURIComponent('_'));
    const allCount = (await request('/api/appeals?limit=100')).json.total;
    /* "_" joker bo'lsa HAMMA qator qaytardi; to'g'ri ishlasa faqat tarkibida "_" borlari */
    check('"_" joker sifatida ishlamaydi',
      underscore.json.total < allCount &&
      underscore.json.rows.every((r) => `${r.body}${r.authorUsername || ''}${r.authorName || ''}${r.code}`.includes('_')),
      `topildi ${underscore.json.total} / jami ${allCount}`);

    section('Kunlik xulosa (dekanat chatiga)');
    sent.length = 0;
    const digest = await request('/api/digest', { method: 'POST' });
    await sleep(200);
    check('kunlik xulosa yuborildi', digest.status === 200 && digest.json.sent === true);
    const digestMessage = sent.find((m) => String(m.chat_id) === '999' && String(m.text).includes('Kunlik xulosa'));
    check('xulosada kechikkan murojaat ko\'rsatilgan', !!digestMessage && digestMessage.text.includes(fresh.code), digestMessage ? 'topilmadi: kod' : 'xabar yo\'q');

    section('Telegram orqali boshqarish (dekanat chati)');
    sent.length = 0;
    await sendUpdate({
      message: {
        message_id: ++messageId, date: Math.floor(Date.now() / 1000),
        chat: { id: 999, type: 'group' }, from: { id: 555, is_bot: false, first_name: 'Dekan', username: 'dekan' },
        text: `/javob ${appeal.code} Telegram orqali yuborilgan javob matni.`,
      },
    });
    await sleep(250);
    check('/javob buyrug\'i javobni yetkazadi', sent.some((m) => String(m.chat_id) === '777' && String(m.text).includes('Telegram orqali yuborilgan javob')));
    check('dekanat chatiga tasdiq keldi', sent.some((m) => String(m.chat_id) === '999' && String(m.text).includes('yuborildi')));

    sent.length = 0;
    await sendUpdate({
      message: {
        message_id: ++messageId, date: Math.floor(Date.now() / 1000),
        chat: { id: 999, type: 'group' }, from: { id: 555, is_bot: false, first_name: 'Dekan' },
        text: '/statistika',
      },
    });
    await sleep(200);
    check('/statistika holat ko\'rsatadi', sent.some((m) => String(m.text).includes('Murojaatlar holati') && String(m.text).includes('Kechikkan')));

    sent.length = 0;
    await sendUpdate({
      message: {
        message_id: ++messageId, date: Math.floor(Date.now() / 1000),
        chat: { id: 1234, type: 'group' }, from: { id: 556, is_bot: false, first_name: 'Begona' },
        text: `/javob ${appeal.code} Begona chatdan javob urinishi.`,
      },
    });
    await sleep(200);
    check('begona chatdan /javob ishlamaydi', sent.length === 0, 'yuborilgan: ' + JSON.stringify(sent).slice(0, 100));

    section('Tuzatilgan nuqsonlar: bot oqimlari');

    /* bot-01: dekanning SHAXSIY chatidan "reply" qilib javob berish */
    sent.length = 0;
    await sendUpdate(textUpdate('Yotoqxona masalasida yordam so\'rab murojaat qilyapman.', { id: 901, first_name: 'Shaxsiy' }));
    await sleep(250);
    const privateNotice = sent.find((m) => String(m.chat_id) === '998' && String(m.text).includes('Yangi murojaat'));
    check('bot-01: dekanning shaxsiy chatiga xabarnoma keldi', !!privateNotice);
    sent.length = 0;
    await sendUpdate({
      message: {
        message_id: ++messageId, date: Math.floor(Date.now() / 1000),
        chat: { id: 998, type: 'private' }, from: { id: 998, is_bot: false, first_name: 'Dekan' },
        text: 'Yotoqxona bo\'yicha ariza qabul qilindi, ertaga javob beramiz.',
        reply_to_message: { message_id: privateNotice._messageId, date: 0, chat: { id: 998, type: 'private' }, text: privateNotice.text },
      },
    });
    await sleep(250);
    check('bot-01: shaxsiy chatdagi javob FUQAROGA yetkazildi',
      sent.some((m) => String(m.chat_id) === '901' && String(m.text).includes('Yotoqxona bo\'yicha ariza qabul qilindi')),
      JSON.stringify(sent.map((m) => m.chat_id)));
    check('bot-01: javob yangi murojaatga aylanmadi',
      (await request('/api/appeals?search=' + encodeURIComponent('ertaga javob beramiz'))).json.total === 0);

    /* bot-02 / bot-07 / bot-09: albom (caption oxirida keladi) */
    sent.length = 0;
    const albumId = 'mg-test-1';
    photo = (n) => ([
      { file_id: `s${n}`, file_unique_id: `us${n}`, width: 90, height: 90, file_size: 800 },
      { file_id: `b${n}`, file_unique_id: `ub${n}`, width: 1280, height: 960, file_size: 50_000 },
    ]);
    for (let i = 1; i <= 3; i++) {
      await sendUpdate({
        message: {
          message_id: ++messageId, date: Math.floor(Date.now() / 1000),
          chat: { id: 902, type: 'private' }, from: { id: 902, is_bot: false, first_name: 'Albom' },
          media_group_id: albumId, photo: photo(i),
          ...(i === 3 ? { caption: 'Imtihon varaqalarining rasmlari ilova qilindi, tekshirib bersangiz.' } : {}),
        },
      });
      await sleep(80);
    }
    await sleep(3200);   // albom buferi yopilishini kutamiz
    const albumAppeal = (await request('/api/appeals?search=' + encodeURIComponent('Imtihon varaqalarining'))).json.rows[0];
    check('bot-02: albom BITTA murojaat yaratdi', !!albumAppeal && albumAppeal.attachmentsCount === 3,
      albumAppeal ? 'ilovalar: ' + albumAppeal.attachmentsCount : 'murojaat topilmadi');
    check('bot-09: tasdiq xabarida fayl soni to\'g\'ri', sent.some((m) => String(m.chat_id) === '902' && String(m.text).includes('3 ta fayl')),
      JSON.stringify(sent.filter((m) => String(m.chat_id) === '902').map((m) => String(m.text).slice(0, 60))));
    check('bot-07: albom uchun faqat bitta tasdiq yuborildi',
      sent.filter((m) => String(m.chat_id) === '902' && String(m.text).includes('qabul qilindi')).length === 1);

    /* bot-07: caption'siz albom — bot jim qolmasligi kerak */
    sent.length = 0;
    for (let i = 1; i <= 2; i++) {
      await sendUpdate({
        message: {
          message_id: ++messageId, date: Math.floor(Date.now() / 1000),
          chat: { id: 903, type: 'private' }, from: { id: 903, is_bot: false, first_name: 'Jim' },
          media_group_id: 'mg-test-2', photo: photo(10 + i),
        },
      });
      await sleep(80);
    }
    await sleep(3200);
    check('bot-07: izohsiz albomga javob beriladi',
      sent.some((m) => String(m.chat_id) === '903' && String(m.text).includes('2 ta fayl qabul qilindi')));

    /* bot-06: takroriy update — bitta murojaat */
    const dupUpdate = {
      update_id: 999_111,
      message: {
        message_id: 777_001, date: Math.floor(Date.now() / 1000),
        chat: { id: 904, type: 'private' }, from: { id: 904, is_bot: false, first_name: 'Takror' },
        text: 'Telegram qayta yuborgan takroriy xabar matni, bitta murojaat bo\'lishi kerak.',
      },
    };
    sent.length = 0;
    await fetch(BASE + WEBHOOK_PATH, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': WEBHOOK_SECRET }, body: JSON.stringify(dupUpdate) });
    await sleep(300);
    await fetch(BASE + WEBHOOK_PATH, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': WEBHOOK_SECRET }, body: JSON.stringify(dupUpdate) });
    await sleep(300);
    const dupSearch = await request('/api/appeals?search=' + encodeURIComponent('takroriy xabar matni'));
    check('bot-06: takroriy update ikkinchi murojaat yaratmadi', dupSearch.json.total === 1, 'topildi: ' + dupSearch.json.total);
    check('bot-06: ikkinchi tasdiq yuborilmadi',
      sent.filter((m) => String(m.chat_id) === '904' && String(m.text).includes('qabul qilindi')).length === 1);

    /* bot-03: chegara rad etsa — fayl keyingi murojaatga yopishmaydi */
    sent.length = 0;
    for (let i = 0; i < 3; i++) {
      await sendUpdate(textUpdate(`Chegarani to'ldirish uchun murojaat ${i}.`, { id: 905, first_name: 'Chegara' }));
      await sleep(70);
    }
    await sendUpdate({
      message: {
        message_id: ++messageId, date: Math.floor(Date.now() / 1000),
        chat: { id: 905, type: 'private' }, from: { id: 905, is_bot: false, first_name: 'Chegara' },
        caption: 'Maxfiy tibbiy ma\'lumotnoma ilova qilindi, ko\'rib chiqing.', photo: photo(20),
      },
    });
    await sleep(250);
    check('bot-03: chegarada fayl saqlanmagani aytiladi',
      sent.some((m) => String(m.chat_id) === '905' && String(m.text).includes('fayl')), 'xabar yo\'q');
    /* vaqtni orqaga surib, chegarani bo'shatamiz va aloqasiz murojaat yuboramiz */
    const db2 = new Database(path.join(dataDir, 'murojaat.db'));
    db2.prepare('UPDATE appeals SET created_at = created_at - ? WHERE tg_id = 905').run(2 * 3600_000);
    db2.close();
    sent.length = 0;
    await sendUpdate(textUpdate('Butunlay boshqa mavzu: kutubxona ish vaqti haqida savol.', { id: 905, first_name: 'Chegara' }));
    await sleep(250);
    const unrelated = (await request('/api/appeals?search=' + encodeURIComponent('kutubxona ish vaqti'))).json.rows[0];
    check('bot-03: maxfiy fayl aloqasiz murojaatga qo\'shilmadi', !!unrelated && !unrelated.attachmentsCount,
      unrelated ? 'ilovalar: ' + unrelated.attachmentsCount : 'murojaat yo\'q');

    /* bot-04: begona kontakt */
    sent.length = 0;
    await sendUpdate({
      message: {
        message_id: ++messageId, date: Math.floor(Date.now() / 1000),
        chat: { id: 906, type: 'private' }, from: { id: 906, is_bot: false, first_name: 'Kontakt' },
        contact: { phone_number: '+998935556677', first_name: 'Begona' },   // user_id YO'Q
      },
    });
    await sleep(200);
    check('bot-04: begona raqam qabul qilinmaydi',
      sent.some((m) => String(m.text).includes('o\'z</b> raqamingizni')), JSON.stringify(sent).slice(0, 120));
    const users906 = (await request('/api/tg-users?limit=200')).json.rows.find((u) => u.tgId === 906);
    check('bot-04: begona raqam bazaga yozilmadi', !users906 || !users906.phone);

    /* bot-08: emoji chegarasi — xabar to'g'ri UTF-16 bo'lishi kerak */
    sent.length = 0;
    await sendUpdate(textUpdate('X'.repeat(1199) + '😀' + 'Y'.repeat(60), { id: 907, first_name: 'Emoji' }));
    await sleep(250);
    const notice = sent.find((m) => String(m.chat_id) === '999' && String(m.text).includes('Yangi murojaat'));
    check('bot-08: dekanat xabarnomasi yuborildi (emoji kesilgan joyda)', !!notice);
    check('bot-08: xabar matni to\'g\'ri UTF-16 (yolg\'iz surrogate yo\'q)',
      !!notice && (!notice.text.isWellFormed || notice.text.isWellFormed()));

    /* bot-10: o'chirilgan murojaat ustida inline tugma */
    const toDelete = (await request('/api/appeals?limit=1')).json.rows[0];
    await request(`/api/appeals/${toDelete.id}/delete`, { method: 'POST' });
    await sendUpdate({
      callback_query: {
        id: 'cb-1', from: { id: 555, is_bot: false, first_name: 'Dekan' },
        message: { message_id: ++messageId, date: 0, chat: { id: 999, type: 'group' }, text: 'xabarnoma' },
        chat_instance: 'x', data: `st:${toDelete.id}:closed`,
      },
    });
    await sleep(200);
    const afterDelete = await request('/api/appeals/' + toDelete.id);
    check('bot-10: o\'chirilgan murojaat holati o\'zgartirilmadi', afterDelete.json.appeal.status === toDelete.status);
    await request(`/api/appeals/${toDelete.id}/restore`, { method: 'POST' });

    /* bot-11: begona chatdan callback — javob beriladi (tugma muzlab qolmaydi) */
    apiCalls.length = 0;
    await sendUpdate({
      callback_query: {
        id: 'cb-2', from: { id: 557, is_bot: false, first_name: 'Begona' },
        message: { message_id: ++messageId, date: 0, chat: { id: -100555, type: 'group' }, text: 'xabarnoma' },
        chat_instance: 'y', data: 'st:1:closed',
      },
    });
    await sleep(200);
    check('bot-11: begona chatdagi tugmaga javob qaytarildi', apiCalls.includes('answerCallbackQuery'), JSON.stringify(apiCalls));

    section('Tuzatilgan nuqsonlar: panel va javob yetkazish');

    /* fe-04: uzun javob (HTML qochirishdan keyin 4096 dan oshadi) bo'laklab yuboriladi */
    sent.length = 0;
    const longBody = '"'.repeat(1200) + ' uzun javob matni ' + 'x'.repeat(1500);
    const longReply = await request(`/api/appeals/${appeal.id}/reply`, { method: 'POST', body: { body: longBody } });
    await sleep(200);
    const pieces = sent.filter((m) => String(m.chat_id) === '777');
    check('fe-04: uzun javob yuborildi', longReply.status === 200 && pieces.length >= 1, 'status=' + longReply.status);
    check('fe-04: har bir xabar Telegram chegarasidan kichik',
      pieces.length > 0 && pieces.every((m) => String(m.text).length <= 4096),
      'uzunliklar: ' + pieces.map((m) => String(m.text).length).join(', '));
    check('fe-04: javob matni to\'liq yetkazildi',
      pieces.map((m) => String(m.text)).join('').includes('uzun javob matni'));

    /* fe-02: javob yetkazilmasa — 502, lekin javob bazada saqlanadi */
    sent.length = 0;
    await sendUpdate(textUpdate('Botni bloklagan foydalanuvchining murojaati matni.', { id: 909, first_name: 'Bloklagan' }));
    await sleep(250);
    const blockedAppeal = (await request('/api/appeals?search=' + encodeURIComponent('Botni bloklagan'))).json.rows[0];
    check('fe-02: bot bloklangan bo\'lsa ham murojaat saqlanadi', !!blockedAppeal);
    const failedReply = await request(`/api/appeals/${blockedAppeal.id}/reply`, { method: 'POST', body: { body: 'Yetkazilmaydigan javob.' } });
    check('fe-02: yetkazilmagan javob 502 qaytaradi', failedReply.status === 502 && failedReply.json.error === 'delivery_failed');
    const failedDetail = await request('/api/appeals/' + blockedAppeal.id);
    check('fe-02: javob bazada "yetkazilmadi" deb saqlanadi',
      failedDetail.json.replies.length === 1 && failedDetail.json.replies[0].delivered === false && !!failedDetail.json.replies[0].deliveryError);
    check('fe-02: yetkazilmagan javobdan keyin holat "answered" bo\'lmaydi', failedDetail.json.appeal.status !== 'answered');

    /* fe-05: arxivlangan murojaat */
    const archived = (await request('/api/appeals?limit=1&offset=1')).json.rows[0];
    await request(`/api/appeals/${archived.id}/delete`, { method: 'POST' });
    const archStatus = await request(`/api/appeals/${archived.id}/status`, { method: 'POST', body: { status: 'closed' } });
    check('fe-05: arxivlangan murojaat holati o\'zgartirilmaydi', archStatus.status === 400 && archStatus.json.error === 'deleted');
    const archDetail = await request('/api/appeals/' + archived.id);
    check('fe-05: owner arxivni ko\'ra oladi va belgisi bor', archDetail.status === 200 && !!archDetail.json.appeal.deletedAt);
    await request(`/api/appeals/${archived.id}/restore`, { method: 'POST' });
    check('fe-05: tiklangandan keyin belgi yo\'qoladi', !(await request('/api/appeals/' + archived.id)).json.appeal.deletedAt);

    /* fe-08: "javob berilgan" sanasi holat qaytarilganda tozalanadi */
    const dateTest = (await request('/api/appeals?limit=1')).json.rows[0];
    await request(`/api/appeals/${dateTest.id}/status`, { method: 'POST', body: { status: 'answered' } });
    const answeredAt = (await request('/api/appeals/' + dateTest.id)).json.appeal.answeredAt;
    await request(`/api/appeals/${dateTest.id}/status`, { method: 'POST', body: { status: 'new' } });
    const afterBack = (await request('/api/appeals/' + dateTest.id)).json.appeal;
    check('fe-08: javob sanasi yozildi', !!answeredAt);
    check('fe-08: holat qaytarilganda javob sanasi tozalanadi', afterBack.answeredAt === null, 'qiymat: ' + afterBack.answeredAt);

    section('Tuzatilgan nuqsonlar: xavfsizlik');

    /* sec-05: juda katta tana → 413 */
    const huge = await request(`/api/appeals/${appeal.id}/reply`, { method: 'POST', body: { body: 'x'.repeat(80_000) } });
    check('sec-05: haddan katta so\'rov 413 qaytaradi', huge.status === 413 && huge.json.error === 'payload_too_large', 'status=' + huge.status);

    section('Ikki qadamli kirish (2FA)');
    const badPass = await request('/api/totp/init', { method: 'POST', body: { password: 'xato-parol' } });
    check('2FA: xato parol bilan kalit berilmaydi', badPass.status === 401);
    const init = await request('/api/totp/init', { method: 'POST', body: { password: ADMIN_PASSWORD } });
    check('2FA: kalit va otpauth havolasi keldi',
      init.status === 200 && init.json.secret.length >= 16 && init.json.otpauth.startsWith('otpauth://totp/'));
    const badCode = await request('/api/totp/enable', { method: 'POST', body: { secret: init.json.secret, code: '000000' } });
    check('2FA: xato kod rad etiladi', badCode.status === 400);
    const goodCode = totpCode(init.json.secret, Math.floor(Date.now() / 30000));
    const enabled = await request('/api/totp/enable', { method: 'POST', body: { secret: init.json.secret, code: goodCode } });
    check('2FA yoqildi', enabled.status === 200);

    const savedCookie = cookie, savedCsrf = csrf;
    cookie = '';
    const noCode = await request('/api/login', { method: 'POST', body: { username: 'admin', password: ADMIN_PASSWORD } });
    check('2FA yoqilgach kodsiz kirish mumkin emas', noCode.status === 401 && noCode.json.error === 'bad_totp');
    const withCode = await request('/api/login', { method: 'POST', body: { username: 'admin', password: ADMIN_PASSWORD, totp: totpCode(init.json.secret, Math.floor(Date.now() / 30000)) } });
    check('to\'g\'ri kod bilan kirish ishlaydi', withCode.status === 200);
    csrf = withCode.json.csrf;
    const meTotp = await request('/api/me');
    check('/api/me 2FA holatini bildiradi', meTotp.json.totpEnabled === true);
    const disabled = await request('/api/totp/disable', { method: 'POST', body: { password: ADMIN_PASSWORD } });
    check('2FA o\'chirildi', disabled.status === 200);
    cookie = savedCookie; csrf = savedCsrf;

    section('Foydalanuvchini bloklash');
    const block = await request('/api/tg-users/780/block', { method: 'POST', body: { blocked: true, reason: 'spam' } });
    check('bloklash ishlaydi', block.status === 200);
    sent.length = 0;
    await sendUpdate(textUpdate('Bloklangandan keyin yuborilgan murojaat matni.', { id: 780, first_name: 'Spam' }));
    await sleep(150);
    check('bloklangan foydalanuvchi murojaat yubora olmaydi',
      sent.some((m) => String(m.text).includes('to\'xtatilgan')) && !sent.some((m) => String(m.text).includes('qabul qilindi')));
    await request('/api/tg-users/780/block', { method: 'POST', body: { blocked: false } });

    section('Huquqlar va audit');
    const audit = await request('/api/audit?limit=50');
    check('audit jurnali to\'ldirilgan', audit.status === 200 && audit.json.rows.some((row) => row.action === 'reply') && audit.json.rows.some((row) => row.action === 'login'));
    const newOperator = await request('/api/admins', { method: 'POST', body: { username: 'operator1', password: 'OperatorParol2026', role: 'operator' } });
    check('owner yangi admin qo\'shadi', newOperator.status === 200);
    const weak = await request('/api/admins', { method: 'POST', body: { username: 'zaif', password: '123' } });
    check('zaif parol qabul qilinmaydi', weak.status === 400 && weak.json.error === 'weak_password');

    /* operator huquqi cheklanganini tekshiramiz */
    const ownerCookie = cookie, ownerCsrfSaved = csrf;
    cookie = '';
    const operatorLogin = await request('/api/login', { method: 'POST', body: { username: 'operator1', password: 'OperatorParol2026' } });
    csrf = operatorLogin.json.csrf;
    check('operator kira oladi', operatorLogin.status === 200 && operatorLogin.json.user.role === 'operator');
    check('operator jurnalni ko\'rmaydi', (await request('/api/audit')).status === 403);
    check('operator murojaatni o\'chira olmaydi', (await request(`/api/appeals/${appeal.id}/delete`, { method: 'POST' })).status === 403);
    check('operator admin qo\'sha olmaydi', (await request('/api/admins', { method: 'POST', body: { username: 'x1', password: 'ParolParol2026' } })).status === 403);
    check('operator murojaatlarni ko\'radi', (await request('/api/appeals')).status === 200);
    check('operator kunlik xulosa yubora olmaydi', (await request('/api/digest', { method: 'POST' })).status === 403);
    const opNote = await request(`/api/appeals/${appeal.id}/notes`, { method: 'POST', body: { body: 'Operator izohi' } });
    check('operator ichki izoh yoza oladi', opNote.status === 200);

    section('Tekshiruvda topilgan yangi nuqsonlar');
    /* Owner sessiyasini tiklaymiz (oldingi bo'lim operator hisobiga o'tgan edi) */
    cookie = ownerCookie; csrf = ownerCsrfSaved;

    /* YANGI-1: qulflangan so'rov yangi "xato urinish" sifatida yozilmasligi kerak
       (aks holda hujumchi qulfni cheksiz ushlab turadi) */
    {
      const probe3 = http.createServer();
      const port3 = await listen(probe3);
      await new Promise((r) => probe3.close(r));
      const lockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'murojaat-lock-'));
      const lockChild = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], {
        env: { ...env, PORT: String(port3), PUBLIC_URL: `http://127.0.0.1:${port3}`, DATA_DIR: lockDir, LOGIN_MAX_ATTEMPTS: '3' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const lockBase = `http://127.0.0.1:${port3}`;
      let lockUp = false;
      for (let i = 0; i < 40 && !lockUp; i++) {
        try { lockUp = (await fetch(lockBase + '/healthz')).ok; } catch { await sleep(200); }
      }
      const tryLogin = (pw) => fetch(lockBase + '/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
        body: JSON.stringify({ username: 'admin', password: pw }),
      });
      for (let i = 0; i < 4; i++) await tryLogin('xato' + i);
      const lockedNow = await tryLogin('yana-xato');
      check('yangi-1: qulflash ishlaydi', lockedNow.status === 429, 'status=' + lockedNow.status);

      const lockDb = new Database(path.join(lockDir, 'murojaat.db'));
      const before = lockDb.prepare('SELECT COUNT(*) AS n FROM login_attempts').get().n;
      for (let i = 0; i < 5; i++) await tryLogin('hujum' + i);      // qulflangan holatda
      const after = lockDb.prepare('SELECT COUNT(*) AS n FROM login_attempts').get().n;
      lockDb.close();
      check('yangi-1: qulflangan so\'rovlar qulfni uzaytirmaydi (yangi yozuv yo\'q)',
        after === before, `oldin=${before} keyin=${after}`);

      lockChild.kill('SIGTERM'); await sleep(300); lockChild.kill('SIGKILL');
      fs.rmSync(lockDir, { recursive: true, force: true });
    }

    /* YANGI-2: parol tekshiruvi event-loop'ni bloklamasligi kerak */
    {
      const probe4 = http.createServer();
      const port4 = await listen(probe4);
      await new Promise((r) => probe4.close(r));
      const loadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'murojaat-load-'));
      const loadChild = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], {
        env: { ...env, PORT: String(port4), PUBLIC_URL: `http://127.0.0.1:${port4}`, DATA_DIR: loadDir, LOGIN_MAX_ATTEMPTS: '1000' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const loadBase = `http://127.0.0.1:${port4}`;
      let loadUp = false;
      for (let i = 0; i < 40 && !loadUp; i++) {
        try { loadUp = (await fetch(loadBase + '/healthz')).ok; } catch { await sleep(200); }
      }
      const logins = Array.from({ length: 12 }, (_, i) => fetch(loadBase + '/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
        body: JSON.stringify({ username: 'yoq-odam-' + i, password: 'xato-parol-' + i }),
      }).catch(() => null));
      await sleep(30);
      const started = process.hrtime.bigint();
      const healthDuringLoad = await fetch(loadBase + '/healthz');
      const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
      await Promise.all(logins);
      check('yangi-2: 12 ta login paytida ham server javob beradi (event-loop bloklanmaydi)',
        healthDuringLoad.status === 200 && elapsedMs < 1500, `javob vaqti: ${Math.round(elapsedMs)} ms`);

      loadChild.kill('SIGTERM'); await sleep(300); loadChild.kill('SIGKILL');
      fs.rmSync(loadDir, { recursive: true, force: true });
    }

    /* YANGI-3: dekanning shaxsiy chatida begona xabarga "reply" jim yo'qolmasligi kerak */
    sent.length = 0;
    await sendUpdate({
      message: {
        message_id: ++messageId, date: Math.floor(Date.now() / 1000),
        chat: { id: 998, type: 'private' }, from: { id: 998, is_bot: false, first_name: 'Dekan' },
        text: 'Bu botning eski xabariga javob — murojaat sifatida qabul qilinishi kerak.',
        reply_to_message: { message_id: 999_999, date: 0, chat: { id: 998, type: 'private' }, text: 'eski xabar' },
      },
    });
    await sleep(300);
    check('yangi-3: xabarnomaga tegishli bo\'lmagan reply jim yo\'qolmaydi',
      sent.some((m) => String(m.chat_id) === '998'), JSON.stringify(sent).slice(0, 150));

    /* YANGI-4: bir vaqtda kelgan ikki albom ham to'liq qayta ishlanadi */
    sent.length = 0;
    for (const [chat, group] of [[921, 'alb-A'], [922, 'alb-B']]) {
      for (let i = 1; i <= 2; i++) {
        await sendUpdate({
          message: {
            message_id: ++messageId, date: Math.floor(Date.now() / 1000),
            chat: { id: chat, type: 'private' }, from: { id: chat, is_bot: false, first_name: 'Albom' + chat },
            media_group_id: group, photo: photo(30 + chat + i),
            ...(i === 2 ? { caption: `Albom ${group} uchun izoh matni, tekshirib bering.` } : {}),
          },
        });
        await sleep(50);
      }
    }
    await sleep(3200);
    const albumsResponse = await request('/api/appeals?search=' + encodeURIComponent('uchun izoh matni'));
    const albumRows = albumsResponse.json?.rows || [];
    check('yangi-4: parallel albomlar yo\'qolmaydi',
      albumsResponse.json?.total === 2 && albumRows.every((r) => r.attachmentsCount === 2),
      `status=${albumsResponse.status} javob=${JSON.stringify(albumsResponse.json).slice(0, 160)}`);

    /* YANGI-5: uzun javobning qisman yetkazilishi aniq yoziladi */
    sent.length = 0;
    await sendUpdate(textUpdate('Chegaraga uchraydigan uzun javob uchun murojaat matni.', { id: 910, first_name: 'Chegara429' }));
    await sleep(250);
    const limited = (await request('/api/appeals?search=' + encodeURIComponent('Chegaraga uchraydigan'))).json.rows[0];
    const longReply2 = await request(`/api/appeals/${limited.id}/reply`, { method: 'POST', body: { body: '"'.repeat(1200) + ' ikkinchi bo\'lak ' + 'y'.repeat(1500) + ' uchinchi bo\'lak ' + 'z'.repeat(1500) } });
    check('yangi-5: qisman yetkazilish 502 bilan bildiriladi', longReply2.status === 502, 'status=' + longReply2.status);
    const limitedDetail = await request('/api/appeals/' + limited.id);
    check('yangi-5: nechta bo\'lak yetkazilgani yozib qo\'yiladi',
      /\d+\/\d+ bo'lak yetkazildi/.test(String(limitedDetail.json.replies[0].deliveryError)),
      String(limitedDetail.json.replies[0].deliveryError).slice(0, 120));

    /* YANGI-6: arxivlangan murojaatning fayli operatorga berilmaydi */
    const fileAppeal = (await request('/api/appeals?limit=50')).json.rows.find((r) => r.attachmentsCount > 0);
    const fileDetail2 = await request('/api/appeals/' + fileAppeal.id);
    const secretFileId = fileDetail2.json.attachments[0].id;
    await request(`/api/appeals/${fileAppeal.id}/delete`, { method: 'POST' });
    const ownerCookie2 = cookie, ownerCsrf2 = csrf;
    cookie = '';
    const opLogin = await request('/api/login', { method: 'POST', body: { username: 'operator1', password: 'OperatorParol2026' } });
    csrf = opLogin.json.csrf;
    const opFile = await fetch(`${BASE}/api/attachments/${secretFileId}`, { headers: { Cookie: cookie, 'User-Agent': UA } });
    check('yangi-6: operator arxivlangan murojaat faylini ololmaydi', opFile.status === 404, 'status=' + opFile.status);
    cookie = ownerCookie2; csrf = ownerCsrf2;
    const ownerFile = await fetch(`${BASE}/api/attachments/${secretFileId}`, { headers: { Cookie: cookie, 'User-Agent': UA } });
    check('yangi-6: owner esa ololadi', ownerFile.status === 200, 'status=' + ownerFile.status);
    await request(`/api/appeals/${fileAppeal.id}/restore`, { method: 'POST' });

    /* Keyingi bo'lim operator sessiyasidan boshlanadi — holatni tiklaymiz */
    cookie = '';
    const operatorAgain = await request('/api/login', { method: 'POST', body: { username: 'operator1', password: 'OperatorParol2026' } });
    csrf = operatorAgain.json.csrf;

    section('Sessiya xavfsizligi');
    const otherUa = await request('/api/me', { ua: 'boshqa-brauzer/9' });
    check('brauzer (User-Agent) o\'zgarsa sessiya bekor qilinadi', otherUa.status === 401);
    check('bekor qilingan sessiya qayta ishlamaydi', (await request('/api/me')).status === 401);

    cookie = ownerCookie;
    check('owner sessiyasi hamon amal qiladi', (await request('/api/me')).status === 200);
    const logout = await request('/api/logout', { method: 'POST' });
    check('chiqish ishlaydi', logout.status === 200);
    check('chiqqandan keyin API yopiq', (await request('/api/me')).status === 401);

    section('Brute-force qulflash');
    cookie = ''; csrf = '';
    let locked = false;
    /* sec-02: registr o'zgartirib qulfni aylanib o'tish MUMKIN EMAS */
    const variants = ['admin', 'Admin', 'ADMIN', 'aDmIn'];
    for (let i = 0; i < 16 && !locked; i++) {
      const attempt = await request('/api/login', { method: 'POST', body: { username: variants[i % variants.length], password: 'xato' + i } });
      locked = attempt.status === 429;
    }
    check('sec-02: registr o\'zgarsa ham kirish qulflanadi', locked);
    const afterLock = await request('/api/login', { method: 'POST', body: { username: 'admin', password: ADMIN_PASSWORD } });
    check('qulflanganda to\'g\'ri parol ham o\'tmaydi', afterLock.status === 429);

    section('Tuzatilgan nuqsonlar: sozlama va joylashtirish');
    {
      const { execFileSync } = require('child_process');
      const root = path.join(__dirname, '..');
      const run = (args, extraEnv = {}) => {
        try {
          return { ok: true, out: execFileSync(process.execPath, args, { cwd: root, env: { ...process.env, ...extraEnv }, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }) };
        } catch (err) {
          return { ok: false, out: String(err.stdout || '') + String(err.stderr || '') };
        }
      };

      /* prod-01: parol hashida "$" bo'lmasligi kerak (docker-compose uni buzadi) */
      const hashed = run([path.join(root, 'scripts', 'hash-password.js'), 'TekshiruvParol2026']);
      check('prod-01: hash "$" belgisisiz yoziladi', hashed.ok && /ADMIN_PASSWORD_HASH=scrypt\.[^$]+$/m.test(hashed.out), hashed.out.slice(0, 120));

      /* prod-03: .env ichidagi satr oxiridagi izoh kesiladi */
      const envFile = path.join(dataDir, 'izohli.env');
      fs.writeFileSync(envFile, [
        'NODE_ENV=development      # ishlab chiqarish emas',
        'export APPEALS_PER_HOUR=7   # eksport prefiksi bilan',
        'FACULTY_NAME="Izoh # ichida bo\'lsa saqlanadi"',
      ].join('\n'));
      const parsed = run(['-e', "const {config}=require('./src/config');console.log(JSON.stringify({env:config.nodeEnv,per:config.appealsPerHour,name:config.facultyName}))"],
        { ENV_FILE: envFile, NODE_ENV: '', APPEALS_PER_HOUR: '', FACULTY_NAME: '' });
      let parsedJson = {};
      try { parsedJson = JSON.parse(parsed.out.trim().split('\n').pop()); } catch { /* xato */ }
      check('prod-03: satr ichidagi izoh kesiladi', parsedJson.env === 'development' && parsedJson.per === 7, JSON.stringify(parsedJson));
      check('prod-03: tirnoq ichidagi "#" saqlanadi', String(parsedJson.name || '').includes('#'), parsedJson.name);

      /* prod-08: noto'g'ri sonli sozlama jimgina sukutga tushmaydi */
      const badNum = run([path.join(root, 'src', 'index.js')], {
        ENV_FILE: '/dev/null', NODE_ENV: 'development', BOT_TOKEN, SESSION_SECRET,
        ADMIN_PASSWORD, DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'murojaat-cfg-')),
        LOGIN_MAX_ATTEMPTS: '0', APPEALS_PER_HOUR: '-1', BOT_MODE: 'polling', REQUIRE_HTTPS: 'false',
      });
      check('prod-08: chegaradan tashqari sozlama bilan server ishga tushmaydi',
        !badNum.ok && badNum.out.includes('LOGIN_MAX_ATTEMPTS'), badNum.out.slice(-200));

      /* YANGI-7: kasrli qiymat jimgina qabul qilinmaydi (DIGEST_HOUR=9.5 xulosani o'chirardi) */
      const fractional = run([path.join(root, 'src', 'index.js')], {
        ENV_FILE: '/dev/null', NODE_ENV: 'development', BOT_TOKEN, SESSION_SECRET,
        ADMIN_PASSWORD, DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'murojaat-frac-')),
        DIGEST_HOUR: '9.5', BOT_MODE: 'polling', REQUIRE_HTTPS: 'false',
      });
      check('yangi-7: kasrli DIGEST_HOUR qabul qilinmaydi',
        !fractional.ok && fractional.out.includes('butun son'), fractional.out.slice(-150));

      /* prod-10: setup.js interaktiv bo'lmaganda yaroqsiz .env yozmaydi */
      const setupRun = run([path.join(root, 'scripts', 'setup.js')]);
      check('prod-10: setup TTYsiz aniq xato beradi', !setupRun.ok && setupRun.out.includes('interaktiv terminal'), setupRun.out.slice(0, 120));
      check('prod-10: haqiqiy .env yaratilmadi', !fs.existsSync(path.join(root, '.env')));

      /* prod-09: parolni tiklash skripti */
      const resetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'murojaat-reset-'));
      const resetEnv = { ENV_FILE: '/dev/null', DATA_DIR: resetDir, BOT_TOKEN, SESSION_SECRET, ADMIN_PASSWORD, ADMIN_USERNAME: 'dekanat' };
      run(['-e', "const db=require('./src/db');db.ensureOwner();db.close();"], resetEnv);
      const reset = run([path.join(root, 'scripts', 'reset-password.js'), 'dekanat', 'TiklanganParol2026'], resetEnv);
      const check2 = run(['-e', "const db=require('./src/db');const {verifyPassword}=require('./src/security');const a=db.getAdminByUsername('dekanat');console.log(JSON.stringify({eski:verifyPassword(process.env.ADMIN_PASSWORD,a.password_hash),yangi:verifyPassword('TiklanganParol2026',a.password_hash)}));db.close();"], resetEnv);
      let resetJson = {};
      try { resetJson = JSON.parse(check2.out.trim().split('\n').pop()); } catch { /* xato */ }
      check('prod-09: parolni tiklash skripti ishlaydi', reset.ok && resetJson.yangi === true && resetJson.eski === false, JSON.stringify(resetJson));
      fs.rmSync(resetDir, { recursive: true, force: true });

      /* prod-04: nginx sozlamasi eski versiyalarda ham ishlashi uchun */
      const nginxConf = fs.readFileSync(path.join(root, 'deploy', 'nginx.conf'), 'utf8');
      check('prod-04: "http2 on;" ishlatilmaydi (eski nginx uchun)', !/^\s*http2\s+on;/m.test(nginxConf));
      check('prod-04: limit_req_zone alohida faylda e\'lon qilingan',
        fs.existsSync(path.join(root, 'deploy', 'nginx-limits.conf')) &&
        fs.readFileSync(path.join(root, 'deploy', 'nginx-limits.conf'), 'utf8').includes('limit_req_zone'));

      /* prod-06: systemd yo'llari README bilan mos */
      const unit = fs.readFileSync(path.join(root, 'deploy', 'murojaat-bot.service'), 'utf8');
      check('prod-06: systemd WorkingDirectory ilova papkasini ko\'rsatadi',
        unit.includes('WorkingDirectory=/opt/murojaat-bot/murojaat-bot') &&
        unit.includes('EnvironmentFile=/opt/murojaat-bot/murojaat-bot/.env'));
      check('yangi-8: ma\'lumot papkasini systemd o\'zi yaratadi (StateDirectory)',
        unit.includes('StateDirectory=murojaat-bot') &&
        unit.includes('Environment=DATA_DIR=/var/lib/murojaat-bot') &&
        !unit.includes('ReadWritePaths='));

      /* prod-01: docker-compose Compose .env fayli bilan to'qnashmaydi */
      const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8');
      check('prod-01: compose alohida secrets.env faylidan foydalanadi',
        compose.includes('secrets.env') && !/env_file:\s*\n\s*-\s*\.env\s*$/m.test(compose));
    }

    section('sec-01/03/04: HTTPS majburiyligi va proksi sarlavhalari');
    {
      const probe2 = http.createServer();
      const port2 = await listen(probe2);
      await new Promise((r) => probe2.close(r));
      const dataDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'murojaat-https-'));
      const child2 = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], {
        env: { ...env, PORT: String(port2), PUBLIC_URL: `https://127.0.0.1:${port2}`, DATA_DIR: dataDir2, REQUIRE_HTTPS: 'true', TRUST_PROXY: '' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const logs2 = [];
      child2.stdout.on('data', (c) => logs2.push(c.toString()));
      child2.stderr.on('data', (c) => logs2.push(c.toString()));
      const base2 = `http://127.0.0.1:${port2}`;
      let up = false;
      for (let i = 0; i < 40 && !up; i++) {
        try { const r = await fetch(base2 + '/healthz', { redirect: 'manual' }); up = r.status === 200 || r.status === 308; } catch { await sleep(200); }
      }
      check('HTTPS rejimidagi instansiya ko\'tarildi', up, logs2.join('').slice(-200));

      const health2 = await fetch(base2 + '/healthz', { redirect: 'manual' });
      check('prod-05: /healthz HTTPS rejimida ham 200 qaytaradi (yo\'naltirilmaydi)',
        health2.status === 200, 'status=' + health2.status);

      const spoofed = await fetch(base2 + '/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https', 'User-Agent': UA },
        body: JSON.stringify({ username: 'admin', password: ADMIN_PASSWORD }),
        redirect: 'manual',
      });
      check('sec-01: soxta X-Forwarded-Proto HTTPS himoyasini aylanib o\'tolmaydi', spoofed.status === 400, 'status=' + spoofed.status);

      const plain = await fetch(base2 + '/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
        body: JSON.stringify({ username: 'admin', password: ADMIN_PASSWORD }), redirect: 'manual',
      });
      check('HTTPSsiz kirish rad etiladi', plain.status === 400);

      const spoofedIp = await fetch(base2 + '/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '1.2.3.4', 'X-Forwarded-Proto': 'https', 'User-Agent': UA },
        body: JSON.stringify({ username: 'admin', password: 'xato' }), redirect: 'manual',
      });
      check('sec-04: soxta X-Forwarded-For ishonchsiz manbadan qabul qilinmaydi', spoofedIp.status === 400);

      child2.kill('SIGTERM');
      await sleep(400);
      child2.kill('SIGKILL');
      fs.rmSync(dataDir2, { recursive: true, force: true });
    }

    section('Replit muhiti (avtomatik sozlanish)');
    {
      const probe5 = http.createServer();
      const port5 = await listen(probe5);
      await new Promise((r) => probe5.close(r));
      const replitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'murojaat-replit-'));

      /* Replit'da foydalanuvchi faqat Secrets qo'yadi: HOST, TRUST_PROXY,
         REQUIRE_HTTPS, PUBLIC_URL berilmaydi — ilova o'zi aniqlashi kerak */
      const replitChild = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], {
        env: {
          PATH: process.env.PATH, HOME: process.env.HOME,
          ENV_FILE: '/dev/null', LOG_LEVEL: 'warn',
          REPL_ID: 'test-repl-id', REPL_SLUG: 'murojaat-bot', REPL_OWNER: 'dekanat',
          REPLIT_DOMAINS: `127.0.0.1:${port5}`, REPLIT_DEPLOYMENT: '1',
          PORT: String(port5),
          BOT_TOKEN, BOT_API_ROOT: `http://127.0.0.1:${apiPort}`,
          BOT_MODE: 'webhook', WEBHOOK_SECRET, SESSION_SECRET,
          ADMIN_USERNAME: 'dekanat', ADMIN_PASSWORD, DATA_DIR: replitDir,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const replitLogs = [];
      replitChild.stdout.on('data', (c) => replitLogs.push(c.toString()));
      replitChild.stderr.on('data', (c) => replitLogs.push(c.toString()));

      const replitBase = `http://127.0.0.1:${port5}`;
      let replitUp = false;
      for (let i = 0; i < 50 && !replitUp; i++) {
        try { replitUp = (await fetch(replitBase + '/healthz', { redirect: 'manual' })).status === 200; } catch { await sleep(200); }
      }
      check('replit: sozlamasiz (faqat Secrets bilan) ishga tushadi', replitUp, replitLogs.join('').slice(-250));

      /* Replit proxy'si shunday so'rov yuboradi */
      const viaProxy = (pathname, init = {}) => fetch(replitBase + pathname, {
        ...init, redirect: 'manual',
        headers: {
          'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '203.0.113.77',
          Host: 'murojaat-bot.dekanat.replit.app', 'User-Agent': UA,
          ...(init.headers || {}),
        },
      });

      const replitPage = await viaProxy('/');
      check('replit: panel ochiladi (cheksiz redirect yo\'q)', replitPage.status === 200,
        `status=${replitPage.status} location=${replitPage.headers.get('location')}`);

      const replitLogin = await viaProxy('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'dekanat', password: ADMIN_PASSWORD }),
      });
      const replitCookie = replitLogin.headers.get('set-cookie') || '';
      check('replit: panelga kirish ishlaydi', replitLogin.status === 200, 'status=' + replitLogin.status);
      check('replit: cookie __Host- + Secure bilan beriladi',
        replitCookie.includes('__Host-') && replitCookie.includes('Secure') && replitCookie.includes('SameSite=Strict'),
        replitCookie.slice(0, 90));

      const replitMe = await viaProxy('/api/me', { headers: { Cookie: replitCookie.split(';')[0] } });
      check('replit: sessiya amal qiladi', replitMe.status === 200, 'status=' + replitMe.status);

      const replitDirect = await fetch(replitBase + '/api/me', { redirect: 'manual', headers: { 'User-Agent': UA } });
      check('replit: HTTPSsiz so\'rov hamon yo\'naltiriladi', replitDirect.status === 308, 'status=' + replitDirect.status);

      /* Mijoz o'zi "X-Forwarded-Proto: https" qo'shsa — proksi qiymati ENG O'NGDA
         bo'ladi, shuning uchun soxtalashtirish ishlamasligi kerak */
      const spoofProto = await fetch(replitBase + '/api/login', {
        method: 'POST', redirect: 'manual',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https, http', 'User-Agent': UA },
        body: JSON.stringify({ username: 'dekanat', password: ADMIN_PASSWORD }),
      });
      check('replit: soxta X-Forwarded-Proto HTTPS himoyasini buzmaydi', spoofProto.status === 400, 'status=' + spoofProto.status);

      const realProto = await fetch(replitBase + '/healthz', {
        redirect: 'manual', headers: { 'X-Forwarded-Proto': 'http, https', 'User-Agent': UA },
      });
      check('replit: haqiqiy proksi qiymati qabul qilinadi', realProto.status === 200, 'status=' + realProto.status);

      const replitHook = await fetch(replitBase + WEBHOOK_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': WEBHOOK_SECRET, 'X-Forwarded-Proto': 'https' },
        body: JSON.stringify({
          update_id: 777_777,
          message: { message_id: 1, date: Math.floor(Date.now() / 1000), chat: { id: 931, type: 'private' }, from: { id: 931, is_bot: false, first_name: 'Replit' }, text: 'Replit orqali kelgan sinov murojaati matni.' },
        }),
      });
      await sleep(300);
      check('replit: webhook qabul qilinadi', replitHook.status === 200, 'status=' + replitHook.status);

      const replitDb = new Database(path.join(replitDir, 'murojaat.db'), { readonly: true });
      const replitCount = replitDb.prepare('SELECT COUNT(*) AS n FROM appeals').get().n;
      replitDb.close();
      check('replit: murojaat bazaga saqlanadi', replitCount === 1, 'murojaatlar: ' + replitCount);

      replitChild.kill('SIGTERM'); await sleep(400); replitChild.kill('SIGKILL');
      fs.rmSync(replitDir, { recursive: true, force: true });
    }

    section('Zaxira va doimiy saqlash');

    /* Telegram orqali zaxira: dekanat chatidan /zaxira buyrug'i */
    documents.length = 0;
    sent.length = 0;
    await sendUpdate({
      message: {
        message_id: ++messageId, date: Math.floor(Date.now() / 1000),
        chat: { id: 999, type: 'group' }, from: { id: 555, is_bot: false, first_name: 'Dekan' },
        text: '/zaxira',
      },
    });
    await sleep(900);
    const backupDoc = documents.find((d) => String(d.chat_id) === '999');
    check('zaxira: /zaxira buyrug\'i bazani fayl qilib yuboradi', !!backupDoc, JSON.stringify(documents).slice(0, 150));
    check('zaxira: fayl nomi va hajmi to\'g\'ri',
      !!backupDoc && /^murojaat-[\d-]+\.db\.gz$/.test(backupDoc.fileName) && backupDoc.size > 500,
      backupDoc ? `${backupDoc.fileName} (${backupDoc.size} bayt)` : '');
    check('zaxira: izohda murojaatlar soni ko\'rsatiladi',
      !!backupDoc && backupDoc.caption.includes('Murojaatlar'), backupDoc ? backupDoc.caption.slice(0, 80) : '');

    /* Doimiy saqlash (local rejim): nusxa olish va tiklash */
    {
      const { execFileSync } = require('child_process');
      const root = path.join(__dirname, '..');
      const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'murojaat-store-'));
      const liveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'murojaat-live-'));
      const storageEnv = {
        ...process.env, ENV_FILE: '/dev/null', NODE_ENV: 'development',
        BOT_TOKEN, SESSION_SECRET, ADMIN_PASSWORD,
        DATA_DIR: liveDir, STORAGE_MODE: 'local', STORAGE_DIR: storeDir, LOG_LEVEL: 'error',
      };
      const runNode = (code, env = storageEnv) => {
        try {
          return { ok: true, out: execFileSync(process.execPath, ['-e', code], { cwd: root, env, encoding: 'utf8' }) };
        } catch (err) { return { ok: false, out: String(err.stdout || '') + String(err.stderr || '') }; }
      };

      const created = runNode(`
        const db = require('./src/db');
        db.upsertUser({ id: 4242, first_name: 'Saqlash' });
        db.createAppeal({ tgId: 4242, authorName: 'Saqlash', body: 'Doimiy saqlashni tekshirish uchun murojaat.', chatId: 4242 });
        require('./src/storage').snapshot('shutdown').then((r) => { db.close(); console.log(JSON.stringify(r)); });
      `);
      let snapResult = {};
      try { snapResult = JSON.parse(created.out.trim().split('\n').pop()); } catch { /* xato */ }
      check('saqlash: nusxa tashqi xotiraga yozildi', created.ok && snapResult.saved === true, created.out.slice(-200));
      check('saqlash: nusxa fayli mavjud', fs.readdirSync(storeDir).some((f) => f.includes('live.db')), fs.readdirSync(storeDir).join(','));

      /* Fayl tizimi tozalandi (Replit "Publish" holati) */
      for (const f of fs.readdirSync(liveDir)) fs.rmSync(path.join(liveDir, f), { recursive: true, force: true });
      check('saqlash: baza o\'chirildi (nashr holati taqlid qilindi)', !fs.existsSync(path.join(liveDir, 'murojaat.db')));

      const restored = runNode(`
        require('./src/storage').restoreIfMissing().then((ok) => {
          const db = require('./src/db');
          console.log(JSON.stringify({ ok, appeals: db.listAppeals().total }));
        });
      `);
      let restoreResult = {};
      try { restoreResult = JSON.parse(restored.out.trim().split('\n').pop()); } catch { /* xato */ }
      check('saqlash: ishga tushishda baza avtomatik tiklandi',
        restored.ok && restoreResult.ok === true && restoreResult.appeals === 1,
        restored.out.slice(-200));

      /* npm run restore — Telegram zaxirasidan tiklash */
      const gzPath = path.join(storeDir, 'qoldan-tiklash.db.gz');
      const liveDb = path.join(liveDir, 'murojaat.db');
      fs.writeFileSync(gzPath, require('zlib').gzipSync(fs.readFileSync(liveDb)));
      fs.rmSync(liveDb, { force: true });
      const restoreScript = (() => {
        try {
          return { ok: true, out: execFileSync(process.execPath, [path.join(root, 'scripts', 'restore.js'), gzPath], { cwd: root, env: storageEnv, encoding: 'utf8' }) };
        } catch (err) { return { ok: false, out: String(err.stdout || '') + String(err.stderr || '') }; }
      })();
      check('saqlash: "npm run restore" .gz fayldan tiklaydi',
        restoreScript.ok && restoreScript.out.includes('Murojaatlar: 1'), restoreScript.out.slice(-200));

      const badFile = path.join(storeDir, 'buzuq.db');
      fs.writeFileSync(badFile, 'bu baza emas');
      const badRestore = (() => {
        try { execFileSync(process.execPath, [path.join(root, 'scripts', 'restore.js'), badFile], { cwd: root, env: storageEnv, encoding: 'utf8', stdio: 'pipe' }); return { ok: true, out: '' }; }
        catch (err) { return { ok: false, out: String(err.stdout || '') + String(err.stderr || '') }; }
      })();
      check('saqlash: yaroqsiz fayl rad etiladi', !badRestore.ok && badRestore.out.includes('yaroqli zaxira emas'), badRestore.out.slice(-120));

      fs.rmSync(storeDir, { recursive: true, force: true });
      fs.rmSync(liveDir, { recursive: true, force: true });
    }

    section('Ma\'lumot fayli huquqlari');
    const mode = fs.statSync(path.join(dataDir, 'murojaat.db')).mode & 0o777;
    check('baza fayli faqat egasi uchun (600)', mode === 0o600, '0' + mode.toString(8));
  } catch (err) {
    failures.push('kutilmagan xato: ' + (err && err.stack ? err.stack : err));
    console.error('\n⛔️ ' + (err && err.stack ? err.stack : err));
  }

  await stop();
  fs.rmSync(dataDir, { recursive: true, force: true });

  console.log('\n' + '═'.repeat(64));
  if (failures.length) {
    console.log(`  ${passed} test o'tdi, ${failures.length} ta xato:\n`);
    for (const failure of failures) console.log('   • ' + failure);
    const serverLog = logs.join('');
    if (serverLog.trim()) console.log('\n  — server logi —\n' + serverLog.split('\n').slice(-25).join('\n'));
    process.exit(1);
  }
  console.log(`  ✅ Hammasi yaxshi — ${passed} test o'tdi.`);
  console.log('═'.repeat(64) + '\n');
})();
