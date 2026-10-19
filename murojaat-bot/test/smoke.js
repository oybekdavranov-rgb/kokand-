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
let messageId = 1000;

function mockApi() {
  return http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString() || '{}') : {};
      const method = req.url.split('/').pop();

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
        case 'sendMessage':
          sent.push(body);
          return reply({ message_id: ++messageId, date: Math.floor(Date.now() / 1000), chat: { id: body.chat_id, type: 'private' }, text: body.text });
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
    NOTIFY_CHAT_IDS: '999',
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
    const ownerCookie = cookie;
    cookie = '';
    const operatorLogin = await request('/api/login', { method: 'POST', body: { username: 'operator1', password: 'OperatorParol2026' } });
    csrf = operatorLogin.json.csrf;
    check('operator kira oladi', operatorLogin.status === 200 && operatorLogin.json.user.role === 'operator');
    check('operator jurnalni ko\'rmaydi', (await request('/api/audit')).status === 403);
    check('operator murojaatni o\'chira olmaydi', (await request(`/api/appeals/${appeal.id}/delete`, { method: 'POST' })).status === 403);
    check('operator admin qo\'sha olmaydi', (await request('/api/admins', { method: 'POST', body: { username: 'x1', password: 'ParolParol2026' } })).status === 403);
    check('operator murojaatlarni ko\'radi', (await request('/api/appeals')).status === 200);

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
    for (let i = 0; i < 12 && !locked; i++) {
      const attempt = await request('/api/login', { method: 'POST', body: { username: 'admin', password: 'xato' + i } });
      locked = attempt.status === 429;
    }
    check('ko\'p urinishdan keyin kirish qulflanadi', locked);
    const afterLock = await request('/api/login', { method: 'POST', body: { username: 'admin', password: ADMIN_PASSWORD } });
    check('qulflanganda to\'g\'ri parol ham o\'tmaydi', afterLock.status === 429);

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
