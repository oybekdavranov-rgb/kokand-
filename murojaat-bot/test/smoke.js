#!/usr/bin/env node
'use strict';
/* =====================================================================
   Uchdan-uchiga tekshiruv (npm test)

   Haqiqiy Telegram'ga ulanmaydi: soxta Bot API serveri ko'tariladi va
   botga webhook orqali "update"lar yuboriladi. So'ng yuborilgan
   xabarlar va bazadagi yozuvlar tekshiriladi.
   ===================================================================== */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const Database = require('better-sqlite3');

const BOT_TOKEN = '123456789:TEST-TOKEN-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const WEBHOOK_SECRET = crypto.randomBytes(24).toString('hex');
const WEBHOOK_PATH = '/tg/' + crypto.createHmac('sha256', WEBHOOK_SECRET).update(BOT_TOKEN).digest('hex').slice(0, 32);

const ADMIN_CHAT = -1001234567890;     // dekanat guruhi
const ADMIN_USER = 5001;               // dekan
const STRANGER = 5002;                 // guruhdagi begona odam

let passed = 0;
const failures = [];
function check(name, condition, detail = '') {
  if (condition) { passed++; console.log('  ✅ ' + name); }
  else { failures.push(name + (detail ? ' → ' + detail : '')); console.log('  ❌ ' + name + (detail ? ' → ' + detail : '')); }
}
const section = (title) => console.log('\n── ' + title + ' ' + '─'.repeat(Math.max(0, 58 - title.length)));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));

/* ===================== Soxta Telegram Bot API ======================= */
const sent = [];         // sendMessage
const documents = [];    // sendDocument
const media = [];        // sendPhoto / sendVideo / ...
const edits = [];        // editMessageText
const apiCalls = [];
let messageId = 1000;
let failChats = new Set();          // shu chatlarga yuborish 403 beradi

function mockApi() {
  return http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      const method = req.url.split('/').pop();
      apiCalls.push(method);
      const ok = (result) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, result })); };

      if (req.url.includes('/file/bot')) { res.writeHead(200); res.end('FAYL'); return; }

      /* Fayl yuborish — multipart */
      if (method === 'sendDocument' && (req.headers['content-type'] || '').includes('multipart')) {
        const text = raw.toString('latin1');
        documents.push({
          chat_id: (/name="chat_id"\r\n\r\n([^\r]+)/.exec(text) || [])[1] || '',
          fileName: (/filename="?([^";\r\n]+)"?/.exec(text) || [])[1] || '',
          caption: (/name="caption"\r\n\r\n([\s\S]*?)\r\n--/.exec(text) || [])[1] || '',
          size: raw.length,
        });
        return ok({ message_id: ++messageId });
      }

      let body = {};
      try { body = raw.length ? JSON.parse(raw.toString()) : {}; } catch { body = {}; }

      switch (method) {
        case 'getMe':
          return ok({ id: 42, is_bot: true, first_name: 'Murojaat', username: 'murojaat_test_bot' });
        case 'sendMessage': {
          if (failChats.has(String(body.chat_id))) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' }));
            return;
          }
          const id = ++messageId;
          sent.push({ ...body, _messageId: id });
          return ok({ message_id: id, date: 0, chat: { id: body.chat_id }, text: body.text });
        }
        case 'sendPhoto': case 'sendVideo': case 'sendVoice': case 'sendAudio': case 'sendVideoNote': case 'sendDocument': {
          const id = ++messageId;
          media.push({ ...body, method, _messageId: id });
          return ok({ message_id: id, date: 0, chat: { id: body.chat_id } });
        }
        case 'editMessageText':
          edits.push(body);
          return ok({ message_id: body.message_id, text: body.text });
        default:
          return ok(true);
      }
    });
  });
}

/* =========================== Yordamchilar =========================== */
let BASE = '';
let updateId = 1;

const post = (pathname, payload, headers = {}) => fetch(BASE + pathname, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(payload),
});

const sendUpdate = (update, secret = WEBHOOK_SECRET) =>
  post(WEBHOOK_PATH, { update_id: updateId++, ...update }, { 'X-Telegram-Bot-Api-Secret-Token': secret });

/* Fuqaro xabari */
const userMessage = (text, user = { id: 777, first_name: 'Ali', username: 'ali_test' }, extra = {}) => ({
  message: {
    message_id: ++messageId, date: Math.floor(Date.now() / 1000),
    chat: { id: user.id, type: 'private' },
    from: { is_bot: false, ...user },
    text, ...extra,
  },
});

const commandMessage = (text, user) => userMessage(text, user, {
  entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }],
});

/* Admin chatidagi xabar */
const adminMessage = (text, extra = {}, from = { id: ADMIN_USER, first_name: 'Dekan', username: 'dekan' }) => ({
  message: {
    message_id: ++messageId, date: Math.floor(Date.now() / 1000),
    chat: { id: ADMIN_CHAT, type: 'supergroup' },
    from: { is_bot: false, ...from },
    text, ...extra,
  },
});

const photoOf = (n) => ([
  { file_id: `small_${n}`, file_unique_id: `us${n}`, width: 90, height: 90, file_size: 900 },
  { file_id: `big_${n}`, file_unique_id: `ub${n}`, width: 1280, height: 720, file_size: 45_000 },
]);

const adminCards = () => sent.filter((m) => String(m.chat_id) === String(ADMIN_CHAT) && String(m.text).includes('Murojaat'));
const toUser = (id) => sent.filter((m) => String(m.chat_id) === String(id));

/* ============================== TEST ================================ */
(async function run() {
  const api = mockApi();
  const apiPort = await listen(api);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'murojaat-test-'));

  const probe = http.createServer();
  const appPort = await listen(probe);
  await new Promise((r) => probe.close(r));
  BASE = `http://127.0.0.1:${appPort}`;

  const env = {
    PATH: process.env.PATH, HOME: process.env.HOME,
    NODE_ENV: 'development', LOG_LEVEL: 'warn', ENV_FILE: '/dev/null',
    PORT: String(appPort), HOST: '127.0.0.1',
    DATA_DIR: dataDir,
    BOT_TOKEN, BOT_API_ROOT: `http://127.0.0.1:${apiPort}`,
    BOT_MODE: 'webhook', WEBHOOK_SECRET, PUBLIC_URL: BASE,
    ADMIN_CHAT_IDS: String(ADMIN_CHAT),
    ADMIN_USER_IDS: String(ADMIN_USER),
    APPEAL_MIN_LENGTH: '12', APPEALS_PER_HOUR: '3', APPEALS_PER_DAY: '6', APPEAL_COOLDOWN_SECONDS: '0',
    BACKUP_TO_TELEGRAM: 'false',
  };

  const child = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const logs = [];
  child.stdout.on('data', (c) => logs.push(c.toString()));
  child.stderr.on('data', (c) => logs.push(c.toString()));

  const stop = async () => {
    child.kill('SIGTERM'); await sleep(400); child.kill('SIGKILL');
    await new Promise((r) => api.close(r));
  };

  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    try { ready = (await fetch(BASE + '/healthz')).ok; } catch { await sleep(200); }
  }
  if (!ready) {
    console.error('\n⛔️ Bot ishga tushmadi:\n' + logs.join(''));
    await stop();
    process.exit(1);
  }

  const db = () => new Database(path.join(dataDir, 'murojaat.db'), { readonly: true });

  try {
    /* ---------------------------------------------------------------- */
    section('Server va webhook');
    const health = await (await fetch(BASE + '/healthz')).json();
    check('holat tekshiruvi ishlaydi', health.ok === true && health.admins === 1, JSON.stringify(health));
    check('noma\'lum yo\'l → 404', (await fetch(BASE + '/panel')).status === 404);
    check('maxfiy sarlavhasiz webhook → 401', (await sendUpdate(userMessage('salom'), 'xato-kalit')).status === 401);
    const noHeader = await fetch(BASE + WEBHOOK_PATH, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    check('sarlavhasiz webhook → 401', noHeader.status === 401);

    section('Fuqaro: murojaat yuborish');
    sent.length = 0;
    await sendUpdate(commandMessage('/start'));
    await sleep(200);
    check('/start → salomlashish', toUser(777).some((m) => String(m.text).includes('murojaat boti')));

    sent.length = 0;
    await sendUpdate(userMessage('qisqa'));
    await sleep(150);
    check('qisqa matn murojaat bo\'lmaydi', toUser(777).some((m) => String(m.text).includes('kamida')));

    sent.length = 0;
    await sendUpdate(userMessage('Dars jadvalida xatolik bor, 3-kurs uchun ikki fan ustma-ust qo\'yilgan.'));
    await sleep(300);
    const confirm = toUser(777).find((m) => String(m.text).includes('qabul qilindi'));
    check('murojaat qabul qilindi va raqam berildi', !!confirm && /MR-\d{4}-\d{4}/.test(confirm.text), JSON.stringify(toUser(777)).slice(0, 150));

    const card = adminCards()[0];
    check('murojaat ADMIN CHATIGA yuborildi', !!card, JSON.stringify(sent.map((m) => m.chat_id)));
    check('kartada muallif, ID va matn bor',
      !!card && card.text.includes('Ali') && card.text.includes('777') && card.text.includes('Dars jadvalida'),
      card ? card.text.slice(0, 120) : '');
    check('kartada javob berish tugmalari bor',
      !!card && JSON.stringify(card.reply_markup || {}).includes('in_progress'), JSON.stringify(card?.reply_markup).slice(0, 120));
    check('kartada «reply qiling» ko\'rsatmasi bor', !!card && card.text.includes('reply'));

    const appeal = db().prepare('SELECT * FROM appeals ORDER BY id DESC LIMIT 1').get();
    check('murojaat bazaga yozildi', !!appeal && appeal.tg_id === 777 && appeal.status === 'new');
    const route = db().prepare('SELECT * FROM routes WHERE appeal_id = ? AND is_header = 1').get(appeal.id);
    check('javob marshruti saqlandi', !!route && route.chat_id === ADMIN_CHAT);

    section('Fuqaro: fayllar');
    sent.length = 0; media.length = 0;
    await sendUpdate({
      message: {
        message_id: ++messageId, date: Math.floor(Date.now() / 1000),
        chat: { id: 778, type: 'private' }, from: { id: 778, is_bot: false, first_name: 'Dilnoza' },
        caption: 'Imtihon natijasi bilan bog\'liq murojaat, ilova qilaman.',
        photo: photoOf(1),
      },
    });
    await sleep(350);
    check('rasm + izoh → murojaat', toUser(778).some((m) => String(m.text).includes('qabul qilindi')));
    check('rasm admin chatiga yuborildi',
      media.some((m) => String(m.chat_id) === String(ADMIN_CHAT) && m.method === 'sendPhoto'),
      JSON.stringify(media).slice(0, 150));
    check('rasm kartaga javob qilib biriktirildi',
      media.some((m) => m.reply_parameters && m.reply_parameters.message_id));

    /* Albom */
    sent.length = 0; media.length = 0;
    for (let i = 1; i <= 3; i++) {
      await sendUpdate({
        message: {
          message_id: ++messageId, date: Math.floor(Date.now() / 1000),
          chat: { id: 779, type: 'private' }, from: { id: 779, is_bot: false, first_name: 'Albom' },
          media_group_id: 'alb-1', photo: photoOf(10 + i),
          ...(i === 3 ? { caption: 'Imtihon varaqalarining rasmlari ilova qilindi, tekshirib bering.' } : {}),
        },
      });
      await sleep(80);
    }
    await sleep(3200);
    const albumAppeal = db().prepare("SELECT * FROM appeals WHERE body LIKE '%varaqalarining%'").get();
    const albumCount = albumAppeal ? db().prepare('SELECT COUNT(*) AS n FROM attachments WHERE appeal_id = ?').get(albumAppeal.id).n : 0;
    check('albom BITTA murojaat bo\'ldi', !!albumAppeal && albumCount === 3, 'ilovalar: ' + albumCount);
    check('albomning uchala rasmi adminga ketdi',
      media.filter((m) => String(m.chat_id) === String(ADMIN_CHAT)).length === 3,
      'yuborilgan: ' + media.filter((m) => String(m.chat_id) === String(ADMIN_CHAT)).length);
    check('albom uchun bitta tasdiq yuborildi',
      toUser(779).filter((m) => String(m.text).includes('qabul qilindi')).length === 1);

    section('Fuqaro: buyruqlar va chegaralar');
    sent.length = 0;
    await sendUpdate(commandMessage('/murojaatlarim'));
    await sleep(200);
    const myList = toUser(777).find((m) => String(m.text).includes('murojaatlaringiz'));
    check('/murojaatlarim ro\'yxat beradi', !!myList && /MR-\d{4}-\d{4}/.test(myList.text));

    const code = /MR-\d{4}-\d{4}/.exec(myList.text)[0];
    sent.length = 0;
    await sendUpdate(commandMessage('/holat ' + code));
    await sleep(200);
    check('/holat o\'z murojaatini ko\'rsatadi', toUser(777).some((m) => String(m.text).includes(code) && String(m.text).includes('Holati')));

    sent.length = 0;
    await sendUpdate(commandMessage('/holat ' + code, { id: 991, first_name: 'Begona' }));
    await sleep(200);
    check('begona odam boshqaning murojaatini ko\'rolmaydi', toUser(991).some((m) => String(m.text).includes('topilmadi')));

    sent.length = 0;
    for (let i = 0; i < 4; i++) { await sendUpdate(userMessage(`Chegarani tekshirish uchun murojaat ${i}.`, { id: 780, first_name: 'Chegara' })); await sleep(60); }
    check('soatlik chegara ishlaydi', toUser(780).some((m) => String(m.text).includes('chegarasiga yetdingiz')));

    sent.length = 0;
    const dup = { update_id: 555_555, message: { message_id: 909_090, date: Math.floor(Date.now() / 1000), chat: { id: 781, type: 'private' }, from: { id: 781, is_bot: false, first_name: 'Takror' }, text: 'Takroriy update uchun murojaat matni.' } };
    await post(WEBHOOK_PATH, dup, { 'X-Telegram-Bot-Api-Secret-Token': WEBHOOK_SECRET });
    await sleep(250);
    await post(WEBHOOK_PATH, dup, { 'X-Telegram-Bot-Api-Secret-Token': WEBHOOK_SECRET });
    await sleep(250);
    check('takroriy update ikkinchi murojaat yaratmaydi',
      db().prepare("SELECT COUNT(*) AS n FROM appeals WHERE body LIKE '%Takroriy update%'").get().n === 1);

    section('Fuqaro: telefon raqami');
    sent.length = 0;
    await sendUpdate({
      message: {
        message_id: ++messageId, date: Math.floor(Date.now() / 1000),
        chat: { id: 782, type: 'private' }, from: { id: 782, is_bot: false, first_name: 'Kontakt' },
        contact: { phone_number: '+998935556677', first_name: 'Begona' },
      },
    });
    await sleep(200);
    check('begona raqam qabul qilinmaydi', toUser(782).some((m) => String(m.text).includes('raqamingizni')));
    sent.length = 0;
    await sendUpdate({
      message: {
        message_id: ++messageId, date: Math.floor(Date.now() / 1000),
        chat: { id: 782, type: 'private' }, from: { id: 782, is_bot: false, first_name: 'Kontakt' },
        contact: { phone_number: '+998901112233', user_id: 782, first_name: 'Kontakt' },
      },
    });
    await sleep(200);
    check('o\'z raqami saqlanadi',
      db().prepare('SELECT phone FROM users WHERE tg_id = 782').get()?.phone === '+998901112233');

    section('Admin: javob berish');
    sent.length = 0;
    const headerRoute = db().prepare('SELECT * FROM routes WHERE appeal_id = ? AND is_header = 1').get(appeal.id);
    await sendUpdate(adminMessage('Xatolik tuzatildi, dushanbadan yangi jadval kuchga kiradi.', {
      reply_to_message: { message_id: headerRoute.message_id, date: 0, chat: { id: ADMIN_CHAT, type: 'supergroup' }, text: 'karta' },
    }));
    await sleep(350);
    check('admin javobi FUQAROGA yetdi',
      toUser(777).some((m) => String(m.text).includes('Dekanat javobi') && String(m.text).includes('dushanbadan yangi jadval')),
      JSON.stringify(toUser(777)).slice(0, 150));
    check('adminga tasdiq keldi', sent.some((m) => String(m.chat_id) === String(ADMIN_CHAT) && String(m.text).includes('yuborildi')));
    check('holat «javob berilgan»ga o\'tdi',
      db().prepare('SELECT status FROM appeals WHERE id = ?').get(appeal.id).status === 'answered');
    check('admin chatidagi karta yangilandi', edits.some((e) => String(e.text).includes('Javob berilgan')));

    sent.length = 0;
    await sendUpdate(adminMessage(`/javob ${code} Raqam bo'yicha yuborilgan javob matni.`, {
      entities: [{ type: 'bot_command', offset: 0, length: 6 }],
    }));
    await sleep(350);
    check('/javob buyrug\'i ishlaydi', toUser(777).some((m) => String(m.text).includes('Raqam bo\'yicha yuborilgan javob')));

    sent.length = 0;
    await sendUpdate(adminMessage('Shunchaki eslatma yozdim'));
    await sleep(200);
    check('admin chatidagi oddiy matn murojaat BO\'LMAYDI',
      sent.some((m) => String(m.text).includes('dekanat chati')) &&
      db().prepare("SELECT COUNT(*) AS n FROM appeals WHERE body LIKE '%Shunchaki eslatma%'").get().n === 0);

    section('Admin: tugmalar va huquqlar');
    const freshAppeal = db().prepare("SELECT * FROM appeals WHERE status = 'new' ORDER BY id DESC LIMIT 1").get();
    const freshRoute = db().prepare('SELECT * FROM routes WHERE appeal_id = ? AND is_header = 1').get(freshAppeal.id);
    sent.length = 0; edits.length = 0;
    await sendUpdate({
      callback_query: {
        id: 'cb-1', from: { id: ADMIN_USER, is_bot: false, first_name: 'Dekan' },
        message: { message_id: freshRoute.message_id, date: 0, chat: { id: ADMIN_CHAT, type: 'supergroup' }, text: 'karta' },
        chat_instance: 'x', data: `st:${freshAppeal.id}:in_progress`,
      },
    });
    await sleep(300);
    check('tugma holatni o\'zgartiradi',
      db().prepare('SELECT status FROM appeals WHERE id = ?').get(freshAppeal.id).status === 'in_progress');
    check('karta yangilandi', edits.some((e) => String(e.text).includes('Ko\'rib chiqilmoqda')));
    check('muallifga «ko\'rib chiqilmoqda» xabari ketdi',
      toUser(freshAppeal.tg_id).some((m) => String(m.text).includes('ko\'rib chiqilmoqda')));

    sent.length = 0;
    await sendUpdate(adminMessage('Begona odam javob yozmoqchi', {
      reply_to_message: { message_id: freshRoute.message_id, date: 0, chat: { id: ADMIN_CHAT, type: 'supergroup' }, text: 'karta' },
    }, { id: STRANGER, first_name: 'Begona' }));
    await sleep(250);
    check('ADMIN_USER_IDS dagi emas — javob bera olmaydi',
      sent.some((m) => String(m.text).includes('huquqi yo\'q')) &&
      !toUser(freshAppeal.tg_id).some((m) => String(m.text).includes('Begona odam javob')));

    await sendUpdate({
      callback_query: {
        id: 'cb-2', from: { id: STRANGER, is_bot: false, first_name: 'Begona' },
        message: { message_id: freshRoute.message_id, date: 0, chat: { id: ADMIN_CHAT, type: 'supergroup' }, text: 'karta' },
        chat_instance: 'y', data: `st:${freshAppeal.id}:closed`,
      },
    });
    await sleep(250);
    check('begona odam tugmani bosolmaydi',
      db().prepare('SELECT status FROM appeals WHERE id = ?').get(freshAppeal.id).status === 'in_progress');

    await sendUpdate({
      callback_query: {
        id: 'cb-3', from: { id: 6001, is_bot: false, first_name: 'Chetdan' },
        message: { message_id: 1, date: 0, chat: { id: -100999, type: 'supergroup' }, text: 'karta' },
        chat_instance: 'z', data: `st:${freshAppeal.id}:closed`,
      },
    });
    await sleep(200);
    check('begona chatdagi tugmaga javob qaytariladi', apiCalls.includes('answerCallbackQuery'));

    section('Admin: bloklash va buyruqlar');
    sent.length = 0;
    await sendUpdate(adminMessage('/bloklash 780 takroriy spam', { entities: [{ type: 'bot_command', offset: 0, length: 9 }] }));
    await sleep(250);
    check('/bloklash ishlaydi',
      db().prepare('SELECT is_blocked FROM users WHERE tg_id = 780').get().is_blocked === 1);
    sent.length = 0;
    await sendUpdate(userMessage('Bloklangandan keyingi murojaat matni.', { id: 780, first_name: 'Chegara' }));
    await sleep(250);
    check('bloklangan foydalanuvchi murojaat yubora olmaydi',
      toUser(780).some((m) => String(m.text).includes('to\'xtatilgan')) &&
      !adminCards().some((c) => c.text.includes('Bloklangandan keyingi')));
    sent.length = 0;
    await sendUpdate(adminMessage('/blokdan 780', { entities: [{ type: 'bot_command', offset: 0, length: 8 }] }));
    await sleep(250);
    check('/blokdan blokni olib tashlaydi',
      db().prepare('SELECT is_blocked FROM users WHERE tg_id = 780').get().is_blocked === 0);

    sent.length = 0;
    await sendUpdate(adminMessage('/statistika', { entities: [{ type: 'bot_command', offset: 0, length: 11 }] }));
    await sleep(200);
    check('/statistika holat ko\'rsatadi', sent.some((m) => String(m.text).includes('Murojaatlar holati') && String(m.text).includes('Kechikkan')));

    sent.length = 0;
    await sendUpdate(adminMessage('/kechikkanlar', { entities: [{ type: 'bot_command', offset: 0, length: 13 }] }));
    await sleep(200);
    check('/kechikkanlar javob beradi', sent.some((m) => String(m.text).includes('javobsiz')));

    documents.length = 0;
    await sendUpdate(adminMessage('/zaxira', { entities: [{ type: 'bot_command', offset: 0, length: 7 }] }));
    await sleep(900);
    const backup = documents.find((d) => String(d.chat_id) === String(ADMIN_CHAT));
    check('/zaxira bazani fayl qilib yuboradi', !!backup && /murojaat-.*\.db\.gz/.test(backup.fileName), JSON.stringify(documents).slice(0, 120));

    section('Javob yetkazishdagi chekka holatlar');
    sent.length = 0;
    await sendUpdate(userMessage('Emoji chegarasini tekshirish: ' + 'X'.repeat(2990) + '😀' + 'Y'.repeat(100), { id: 783, first_name: 'Emoji' }));
    await sleep(300);
    const emojiCard = adminCards().find((c) => c.text.includes('Emoji chegarasini'));
    check('uzun matn + emoji kartani buzmaydi', !!emojiCard && (!emojiCard.text.isWellFormed || emojiCard.text.isWellFormed()));

    sent.length = 0;
    await sendUpdate(userMessage('<script>alert(1)</script> va <b>html</b> bilan murojaat matni', { id: 784, first_name: '<img src=x onerror=alert(1)>' }));
    await sleep(300);
    const xssCard = adminCards().find((c) => c.text.includes('&lt;script&gt;'));
    check('HTML in\'ektsiyasi qochiriladi', !!xssCard && !xssCard.text.includes('<script>'), xssCard ? 'ok' : 'karta topilmadi');

    const longAppeal = db().prepare("SELECT * FROM appeals WHERE tg_id = 784").get();
    const longRoute = db().prepare('SELECT * FROM routes WHERE appeal_id = ? AND is_header = 1').get(longAppeal.id);
    sent.length = 0;
    await sendUpdate(adminMessage('"'.repeat(1200) + ' uzun javob ' + 'z'.repeat(1500), {
      reply_to_message: { message_id: longRoute.message_id, date: 0, chat: { id: ADMIN_CHAT, type: 'supergroup' }, text: 'karta' },
    }));
    await sleep(2500);
    const pieces = toUser(784);
    check('uzun javob bo\'laklab yuboriladi', pieces.length >= 2 && pieces.every((m) => String(m.text).length <= 4096),
      'bo\'laklar: ' + pieces.map((m) => String(m.text).length).join(', '));

    /* Bot bloklangan foydalanuvchi */
    failChats.add('785');
    sent.length = 0;
    await sendUpdate(userMessage('Botni bloklagan foydalanuvchining murojaati.', { id: 785, first_name: 'Bloklagan' }));
    await sleep(300);
    const blockedAppeal = db().prepare('SELECT * FROM appeals WHERE tg_id = 785').get();
    check('bot bloklangan bo\'lsa ham murojaat adminga yetadi',
      !!blockedAppeal && adminCards().some((c) => c.text.includes('Botni bloklagan')));
    const blockedRoute = db().prepare('SELECT * FROM routes WHERE appeal_id = ? AND is_header = 1').get(blockedAppeal.id);
    sent.length = 0;
    await sendUpdate(adminMessage('Yetkazilmaydigan javob.', {
      reply_to_message: { message_id: blockedRoute.message_id, date: 0, chat: { id: ADMIN_CHAT, type: 'supergroup' }, text: 'karta' },
    }));
    await sleep(400);
    check('yetkazilmagan javob adminga bildiriladi', sent.some((m) => String(m.chat_id) === String(ADMIN_CHAT) && String(m.text).includes('Yuborilmadi')));
    check('yetkazilmagan javob bazada belgilanadi',
      db().prepare('SELECT delivered FROM replies WHERE appeal_id = ? ORDER BY id DESC LIMIT 1').get(blockedAppeal.id).delivered === 0);
    failChats.delete('785');

    section('Ma\'lumot saqlash va tiklash');
    {
      const root = path.join(__dirname, '..');
      const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'murojaat-store-'));
      const liveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'murojaat-live-'));
      const storageEnv = { ...process.env, ENV_FILE: '/dev/null', BOT_TOKEN, ADMIN_CHAT_IDS: String(ADMIN_CHAT), DATA_DIR: liveDir, STORAGE_MODE: 'local', STORAGE_DIR: storeDir, LOG_LEVEL: 'error' };
      const runNode = (code) => {
        try { return { ok: true, out: execFileSync(process.execPath, ['-e', code], { cwd: root, env: storageEnv, encoding: 'utf8' }) }; }
        catch (err) { return { ok: false, out: String(err.stdout || '') + String(err.stderr || '') }; }
      };

      const created = runNode(`
        const store = require('./src/store');
        store.upsertUser({ id: 4242, first_name: 'Saqlash' });
        store.createAppeal({ tgId: 4242, authorName: 'Saqlash', body: 'Saqlashni tekshirish uchun murojaat.', chatId: 4242 });
        require('./src/storage').snapshot('shutdown').then((r) => { store.close(); console.log(JSON.stringify(r)); });
      `);
      let snap = {};
      try { snap = JSON.parse(created.out.trim().split('\n').pop()); } catch { /* xato */ }
      check('nusxa tashqi xotiraga saqlanadi', created.ok && snap.saved === true, created.out.slice(-150));

      for (const f of fs.readdirSync(liveDir)) fs.rmSync(path.join(liveDir, f), { recursive: true, force: true });
      const restored = runNode(`
        require('./src/storage').restoreIfMissing().then((ok) => {
          const store = require('./src/store');
          console.log(JSON.stringify({ ok, appeals: store.stats().total }));
        });
      `);
      let res = {};
      try { res = JSON.parse(restored.out.trim().split('\n').pop()); } catch { /* xato */ }
      check('ishga tushishda baza avtomatik tiklanadi', res.ok === true && res.appeals === 1, restored.out.slice(-150));

      const gz = path.join(storeDir, 'qoldan.db.gz');
      fs.writeFileSync(gz, require('zlib').gzipSync(fs.readFileSync(path.join(liveDir, 'murojaat.db'))));
      fs.rmSync(path.join(liveDir, 'murojaat.db'), { force: true });
      let restoreOut = '';
      try { restoreOut = execFileSync(process.execPath, [path.join(root, 'scripts', 'restore.js'), gz], { cwd: root, env: storageEnv, encoding: 'utf8' }); }
      catch (err) { restoreOut = String(err.stdout || '') + String(err.stderr || ''); }
      check('"npm run restore" zaxiradan tiklaydi', restoreOut.includes('Murojaatlar: 1'), restoreOut.slice(-150));

      fs.rmSync(storeDir, { recursive: true, force: true });
      fs.rmSync(liveDir, { recursive: true, force: true });
    }

    section('Replit muhiti');
    {
      const probe2 = http.createServer();
      const port2 = await listen(probe2);
      await new Promise((r) => probe2.close(r));
      const replitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'murojaat-replit-'));
      const replitChild = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], {
        env: {
          PATH: process.env.PATH, HOME: process.env.HOME, ENV_FILE: '/dev/null', LOG_LEVEL: 'warn',
          REPL_ID: 'test', REPL_SLUG: 'murojaat-bot', REPL_OWNER: 'dekanat',
          REPLIT_DOMAINS: `127.0.0.1:${port2}`, REPLIT_DEPLOYMENT: '1', PORT: String(port2),
          BOT_TOKEN, BOT_API_ROOT: `http://127.0.0.1:${apiPort}`, BOT_MODE: 'polling',
          ADMIN_CHAT_IDS: String(ADMIN_CHAT), DATA_DIR: replitDir, BACKUP_TO_TELEGRAM: 'false',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const replitLogs = [];
      replitChild.stdout.on('data', (c) => replitLogs.push(c.toString()));
      replitChild.stderr.on('data', (c) => replitLogs.push(c.toString()));
      let up = false;
      for (let i = 0; i < 50 && !up; i++) {
        try { up = (await fetch(`http://127.0.0.1:${port2}/healthz`)).ok; } catch { await sleep(200); }
      }
      check('replit: sozlamasiz (faqat Secrets bilan) ishga tushadi', up, replitLogs.join('').slice(-200));
      if (up) {
        const info = await (await fetch(`http://127.0.0.1:${port2}/healthz`)).json();
        check('replit: polling rejimida bot ulandi', info.ok === true && info.mode === 'polling', JSON.stringify(info));
      }
      replitChild.kill('SIGTERM'); await sleep(400); replitChild.kill('SIGKILL');
      fs.rmSync(replitDir, { recursive: true, force: true });
    }

    section('Sozlama tekshiruvlari');
    {
      const root = path.join(__dirname, '..');
      const runApp = (extra) => {
        try { execFileSync(process.execPath, [path.join(root, 'src', 'index.js')], { cwd: root, env: { PATH: process.env.PATH, HOME: process.env.HOME, ENV_FILE: '/dev/null', ...extra }, encoding: 'utf8', timeout: 8000 }); return { ok: true, out: '' }; }
        catch (err) { return { ok: false, out: String(err.stdout || '') + String(err.stderr || '') }; }
      };
      const noAdmin = runApp({ BOT_TOKEN, DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-')) });
      check('ADMIN_CHAT_IDS siz ishga tushmaydi', !noAdmin.ok && noAdmin.out.includes('ADMIN_CHAT_IDS'), noAdmin.out.slice(-150));
      const noToken = runApp({ ADMIN_CHAT_IDS: '123', DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-')) });
      check('BOT_TOKEN siz ishga tushmaydi', !noToken.ok && noToken.out.includes('BOT_TOKEN'), noToken.out.slice(-150));
      const badNum = runApp({ BOT_TOKEN, ADMIN_CHAT_IDS: '123', APPEALS_PER_HOUR: '-1', DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-')) });
      check('noto\'g\'ri sonli sozlama jimgina o\'tmaydi', !badNum.ok && badNum.out.includes('APPEALS_PER_HOUR'), badNum.out.slice(-150));
    }

    section('Fayl huquqlari');
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
    if (serverLog.trim()) console.log('\n  — bot logi —\n' + serverLog.split('\n').slice(-20).join('\n'));
    process.exit(1);
  }
  console.log(`  ✅ Hammasi yaxshi — ${passed} test o'tdi.`);
  console.log('═'.repeat(64) + '\n');
})();
