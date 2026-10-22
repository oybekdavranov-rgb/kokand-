'use strict';
/* =====================================================================
   MUROJAAT BOTI

   Oqim:
     Fuqaro → botga yozadi → bot murojaatni ADMIN CHATIGA yuboradi
     Admin  → o'sha xabarga «reply» qiladi → javob fuqaroga boradi

   Web-panel yo'q: hamma ish Telegram ichida bajariladi.
   ===================================================================== */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { Bot, GrammyError, HttpError, Keyboard, InlineKeyboard, InputFile } = require('grammy');

const { config } = require('./config');
const store = require('./store');
const log = require('./logger');
const { escapeHtml, sanitizeText, cut, RateLimiter } = require('./security');

const bot = new Bot(config.botToken, { client: { apiRoot: config.botApiRoot } });

/* Flood himoyasi (adminlarga tegmaydi) */
const floodLimiter = new RateLimiter({ windowMs: 10_000, max: 8, name: 'flood' });
const floodNotified = new Map();

/* Matnsiz yuborilgan fayllar 10 daqiqa kutadi va keyingi murojaatga qo'shiladi
   (bazada saqlanadi — qayta ishga tushsa ham yo'qolmaydi) */
const PENDING_TTL_MS = 10 * 60_000;

/* Telegram bitta xabarda 4096 belgi beradi */
const TELEGRAM_LIMIT = 4096;

/* Kartada murojaat matnining birinchi qismi ko'rinadi, qolgani alohida xabarda */
const CARD_BODY_LIMIT = 3000;

/* Dekanat javobi: uzun javob bo'laklanib yuboriladi, shuning uchun
   matn jimgina kesilmaydi */
const ADMIN_REPLY_MAX = TELEGRAM_LIMIT;

/* Albom (media-guruh) buferi — Telegram rasmlarni alohida yuboradi */
const ALBUM_WAIT_MS = 2500;
const albums = new Map();

/* Dekanat javobiga ilova qilingan albom buferi */
const adminAlbums = new Map();

const BTN = { myAppeals: '📋 Mening murojaatlarim', help: 'ℹ️ Yordam', phone: '📞 Raqamni ulashish' };

const STATUS_LABEL = {
  new: '🆕 Yangi',
  in_progress: '⏳ Ko\'rib chiqilmoqda',
  answered: '✅ Javob berilgan',
  closed: '🔒 Yopilgan',
};

const mainKeyboard = () => new Keyboard()
  .text(BTN.myAppeals).text(BTN.help).row()
  .requestContact(BTN.phone)
  .resized().persistent();

const fullName = (user) => [user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'Noma\'lum';
const localTime = (ms) => new Date(ms).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' });
const sleep = (ms) => new Promise((resolve) => { const t = setTimeout(resolve, ms); t.unref?.(); });

/* Admin chatimi va admin odammi */
const isAdminChat = (chatId) => config.adminChatIds.includes(chatId);
const isAdminUser = (userId) => !config.adminUserIds.length || config.adminUserIds.includes(userId);

/* =====================================================================
   MATNLAR
   ===================================================================== */
const welcomeText = (name) => `Assalomu alaykum, <b>${escapeHtml(name)}</b>!

Bu — <b>${escapeHtml(config.facultyName)}</b> ${escapeHtml(config.deanTitle)}i
<b>${escapeHtml(config.deanName)}</b> qabulxonasining rasmiy murojaat boti.

✍️ <b>Murojaatingizni shu yerga oddiy xabar qilib yozing.</b>
Mavzu yoki bo'lim tanlash shart emas — muammo, taklif, shikoyat yoki
savolingizni o'z so'zlaringiz bilan yozsangiz bo'ldi.

📎 Kerak bo'lsa rasm, hujjat yoki ovozli xabar ham yuboring.
📞 Qayta aloqa uchun telefon raqamingizni ulashishingiz mumkin (ixtiyoriy).

Murojaatingiz to'g'ridan-to'g'ri dekanatga yetib boradi, javob shu chatga keladi.

<i>Qabul vaqti: ${escapeHtml(config.officeHours)}</i>`;

const helpText = () => `<b>Qanday ishlaydi?</b>

1️⃣ Murojaatingizni shu chatga yozasiz (kamida ${config.appealMinLength} belgi).
2️⃣ Bot sizga raqam beradi, masalan <code>MR-${new Date().getFullYear()}-0007</code>.
3️⃣ Dekanat ko'rib chiqadi va javobni shu bot orqali yuboradi.

<b>Buyruqlar</b>
/start — boshlash
/murojaatlarim — mening murojaatlarim
/holat MR-${new Date().getFullYear()}-0007 — bitta murojaat holati
/yordam — shu qo'llanma

<b>Cheklovlar</b>
• Bitta murojaat: ${config.appealMinLength}–${config.appealMaxLength} belgi
• Soatda ${config.appealsPerHour} ta, kunda ${config.appealsPerDay} ta murojaat
• Fayl: bitta murojaatga ${config.maxAttachmentsPerAppeal} tagacha, ${config.maxAttachmentMb} MB gacha

<b>Maxfiylik</b>
Siz yozgan matn, ismingiz, Telegram username va (ulashsangiz) telefon
raqamingiz faqat dekanat xodimlariga ko'rinadi. Uchinchi shaxslarga berilmaydi.`;

const adminHelpText = () => `<b>Dekanat uchun qo'llanma</b>

Har bir yangi murojaat shu chatga keladi. Javob berish uchun:
• murojaat xabariga <b>«reply»</b> qilib javobingizni yozing, yoki
• <code>/javob MR-${new Date().getFullYear()}-0007 javob matni</code>

Javobga rasm yoki hujjat ham ilova qilsangiz — u ham fuqaroga yetib boradi.

Xabar tagidagi tugmalar: holatni o'zgartirish va bloklash.

<b>Buyruqlar</b>
/murojaat &lt;raqam&gt; — murojaat kartasini qaytadan chiqarish
/navbat — yetib bormagan murojaatlarni qayta yuborish
/statistika — umumiy holat
/kechikkanlar — ${config.slaHours} soatdan beri javobsiz murojaatlar
/javob &lt;raqam&gt; &lt;matn&gt; — raqam bo'yicha javob berish
/bloklash &lt;raqam yoki ID&gt; [sabab] — foydalanuvchini bloklash
/blokdan &lt;raqam yoki ID&gt; — blokni olib tashlash
/bloklanganlar — bloklanganlar ro'yxati
/zaxira — bazaning nusxasini shu chatga yuborish
/yordam — shu qo'llanma`;

const confirmText = (appeal, attachments) => `✅ <b>Murojaatingiz qabul qilindi.</b>

🔖 Raqam: <code>${appeal.code}</code>${appeal.related_code ? ` (<code>${appeal.related_code}</code> ga qo'shimcha)` : ''}
🕒 ${localTime(appeal.created_at)}
${attachments ? `📎 Ilova: ${attachments} ta fayl\n` : ''}
Dekanat ko'rib chiqqach, javob shu chatga keladi.
Holatni bilish: <code>/holat ${appeal.code}</code>`;

/**
 * Matnning kartaga sig'adigan qismini ajratadi.
 * MUHIM: hisob QOCHIRILGAN uzunlik bo'yicha yuritiladi — `&` belgisi
 * `&amp;` ga (5 belgi) aylanadi, shuning uchun 3000 belgilik matn
 * qochirilgandan keyin 15000 belgi bo'lib Telegram'ning 4096 chegarasidan
 * oshib ketishi va murojaat dekanatga UMUMAN yetmasligi mumkin.
 */
function splitBodyForCard(body, overhead) {
  const chars = Array.from(body || '');
  const budget = Math.max(200, TELEGRAM_LIMIT - overhead);
  let used = 0;
  let index = 0;
  while (index < chars.length && index < CARD_BODY_LIMIT) {
    const size = escapeHtml(chars[index]).length;
    if (used + size > budget) break;
    used += size;
    index++;
  }
  return { head: chars.slice(0, index).join(''), rest: chars.slice(index).join('') };
}

/* Admin chatiga yuboriladigan murojaat kartasi (+ kartaga sig'magan qism) */
function buildAppealCard(appeal, attachmentsCount = 0, blocked = false) {
  const author = [
    escapeHtml(appeal.author_name || 'Noma\'lum'),
    appeal.author_username ? '@' + escapeHtml(appeal.author_username) : null,
    appeal.author_phone ? escapeHtml(appeal.author_phone) : null,
  ].filter(Boolean).join(' · ');

  const statusLine = appeal.status === 'new'
    ? ''
    : `\n━━━━━━━━━━━━━━━━━━━━\nHolat: <b>${STATUS_LABEL[appeal.status]}</b>`;

  const head = `${appeal.status === 'new' ? '🆕' : STATUS_LABEL[appeal.status].slice(0, 2)} <b>Murojaat</b> <code>${appeal.code}</code>\n` +
    `👤 ${author}\n` +
    `🆔 <code>${appeal.tg_id}</code>${blocked ? ' ⛔️ <b>bloklangan</b>' : ''}\n` +
    `🕒 ${localTime(appeal.created_at)}` +
    (appeal.related_code ? `\n↩️ Javobga qo'shimcha: <code>${escapeHtml(appeal.related_code)}</code>` : '') +
    (attachmentsCount ? `\n📎 ${attachmentsCount} ta fayl` : '') +
    '\n\n';
  const tail = statusLine + '\n\n<i>Javob berish: shu xabarga «reply» qilib yozing</i>';
  const moreNote = '\n<i>(matn davomi keyingi xabarda)</i>';

  const { head: bodyHead, rest } = splitBodyForCard(appeal.body, head.length + tail.length + moreNote.length + 16);
  const card = head + escapeHtml(bodyHead) + (rest ? moreNote : '') + tail;
  return { card, rest };
}

const appealCard = (appeal, attachmentsCount = 0, blocked = false) =>
  buildAppealCard(appeal, attachmentsCount, blocked).card;

/* Karta yuborilmasa (masalan matn kutilmaganda uzun bo'lsa) — eng kichik karta:
   murojaat baribir ko'rinadi va unga «reply» qilib javob berish mumkin bo'ladi */
function minimalAppealCard(appeal, blocked = false) {
  const { head } = splitBodyForCard(appeal.body, 600);
  return `🆕 <b>Murojaat</b> <code>${appeal.code}</code>\n` +
    `👤 ${escapeHtml(cut(appeal.author_name || 'Noma\'lum', 60))}\n` +
    `🆔 <code>${appeal.tg_id}</code>${blocked ? ' ⛔️ <b>bloklangan</b>' : ''}\n` +
    `🕒 ${localTime(appeal.created_at)}\n\n${escapeHtml(head)}\n` +
    '<i>(to\'liq matn keyingi xabarda)</i>\n\n' +
    '<i>Javob berish: shu xabarga «reply» qilib yozing</i>';
}

function appealButtons(appeal, blocked = false) {
  const keyboard = new InlineKeyboard();
  if (appeal.status !== 'in_progress') keyboard.text('⏳ Ko\'rib chiqilmoqda', `st:${appeal.id}:in_progress`);
  if (appeal.status !== 'closed') keyboard.text('🔒 Yopish', `st:${appeal.id}:closed`);
  keyboard.row().text(blocked ? '♻️ Blokdan chiqarish' : '⛔️ Bloklash', `blk:${appeal.id}`);
  return keyboard;
}

/* =====================================================================
   MIDDLEWARE
   ===================================================================== */

/** Xatoni bir xil ko'rinishda logga yozadi (bot.catch bilan umumiy) */
function reportError(error, where) {
  if (error instanceof GrammyError) log.error(`${where}: Telegram API xatosi`, { description: error.description });
  else if (error instanceof HttpError) log.error(`${where}: tarmoq xatosi`, { error: String(error) });
  else log.error(`${where}: kutilmagan xato`, { error: String(error?.stack || error) });
}

/* MUHIM: grammY webhook rejimida middleware xatosini tashqariga "throw"
   qiladi — u holda HTTP so'rov javobsiz qoladi va Telegram update'ni
   qayta-qayta yuboradi. Shuning uchun xatoni shu yerda to'xtatamiz. */
bot.use(async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    reportError(error, `update ${ctx.update?.update_id ?? '?'}`);
  }
});

bot.use(async (ctx, next) => {
  const from = ctx.from;
  if (!from || from.is_bot) return;

  const chatId = ctx.chat?.id;
  const adminChat = !!chatId && isAdminChat(chatId);
  const isPrivate = ctx.chat?.type === 'private';

  /* Na shaxsiy chat, na admin chati — e'tiborsiz qoldiramiz */
  if (!isPrivate && !adminChat) {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: 'Ruxsat yo\'q', show_alert: true }).catch(() => {});
    return;
  }

  ctx.state = { adminChat, isPrivate, admin: adminChat && isAdminUser(from.id) };

  /* Guruh supergruppaga aylansa chat_id butunlay o'zgaradi va ADMIN_CHAT_IDS
     eskiradi — murojaatlar navbatda qolib ketadi. Dekanatni yangi guruhda
     ogohlantiramiz, aks holda sabab ko'rinmas bo'ladi. */
  if (adminChat && ctx.message?.migrate_to_chat_id) {
    const newChatId = ctx.message.migrate_to_chat_id;
    log.error('DIQQAT: dekanat guruhi supergruppaga aylandi — ADMIN_CHAT_IDS ni yangilang', {
      eski: chatId, yangi: newChatId,
    });
    await bot.api.sendMessage(newChatId,
      '⚠️ <b>Diqqat: guruh supergruppaga aylandi va uning ID\'si o\'zgardi.</b>\n\n' +
      `Sozlamada <code>ADMIN_CHAT_IDS</code> ni yangi ID'ga o'zgartiring:\n<code>${newChatId}</code>\n\n` +
      'Shundan keyin botni qayta ishga tushirib, <code>/navbat</code> yozing — ' +
      'shu vaqt ichida kelgan murojaatlar yetkaziladi.',
      { parse_mode: 'HTML' }).catch(() => {});
    return;
  }

  /* Flood: faqat oddiy foydalanuvchilarga; albom qismlari hisoblanmaydi */
  if (!adminChat && !ctx.message?.media_group_id && !floodLimiter.check('tg:' + from.id).allowed) {
    const entry = floodNotified.get(from.id) || { at: 0, dropped: 0 };
    entry.dropped++;
    if (Date.now() - entry.at > 20_000) {
      const dropped = entry.dropped;
      entry.at = Date.now();
      entry.dropped = 0;
      floodNotified.set(from.id, entry);
      if (floodNotified.size > 5000) floodNotified.clear();
      /* Jim tashlab yubormaymiz: nechta xabar qabul qilinmaganini aytamiz */
      await ctx.reply(`⏱ Juda tez yuborilmoqda — oxirgi ${dropped} ta xabaringiz <b>qabul qilinmadi</b>.\n` +
        'Bir ozdan keyin murojaatingizni qayta yuboring.', { parse_mode: 'HTML' }).catch(() => {});
    } else {
      floodNotified.set(from.id, entry);
    }
    return;
  }

  if (isPrivate && !adminChat) {
    const user = store.upsertUser(from);
    if (user?.is_blocked) {
      await ctx.reply('⛔️ Kechirasiz, sizning murojaat yuborish imkoniyatingiz vaqtincha to\'xtatilgan.\n' +
        'Savol bo\'lsa dekanatga bevosita murojaat qiling.').catch(() => {});
      return;
    }
    ctx.state.user = user;
  }
  await next();
});

/* =====================================================================
   MUROJAATNI ADMINGA YUBORISH — botning asosiy vazifasi
   ===================================================================== */
async function sendAttachment(chatId, attachment, replyTo) {
  const options = { reply_parameters: replyTo ? { message_id: replyTo, allow_sending_without_reply: true } : undefined };
  switch (attachment.kind) {
    case 'photo': return bot.api.sendPhoto(chatId, attachment.fileId, options);
    case 'voice': return bot.api.sendVoice(chatId, attachment.fileId, options);
    case 'audio': return bot.api.sendAudio(chatId, attachment.fileId, options);
    case 'video': return bot.api.sendVideo(chatId, attachment.fileId, options);
    case 'video_note': return bot.api.sendVideoNote(chatId, attachment.fileId, options);
    case 'animation': return bot.api.sendAnimation(chatId, attachment.fileId, options);
    default: return bot.api.sendDocument(chatId, attachment.fileId, options);
  }
}

/** Kartaga sig'magan matnni alohida xabar(lar) qilib yuboradi */
async function sendAppealBodyTail(chatId, appeal, headerId, rest) {
  const remainder = String(rest ?? '');
  if (!remainder) return;
  const chunks = splitForTelegram(remainder, 3500);
  for (let i = 0; i < chunks.length; i++) {
    try {
      const sent = await bot.api.sendMessage(chatId,
        `📝 <b>Murojaat matni — davomi ${i + 1}/${chunks.length}</b>\n🔖 <code>${appeal.code}</code>\n\n${escapeHtml(chunks[i])}`,
        { parse_mode: 'HTML', reply_parameters: { message_id: headerId, allow_sending_without_reply: true } });
      if (sent?.message_id) store.addRoute(chatId, sent.message_id, appeal.id, 0);
    } catch (err) {
      log.warn('matn davomi yuborilmadi', { code: appeal.code, error: String(err.message) });
    }
  }
}

/** Murojaatni barcha admin chatlariga yuboradi va "reply" marshrutlarini yozib qo'yadi */
async function sendAppealToAdmins(appeal, attachments = []) {
  const user = store.getUser(appeal.tg_id);
  const blocked = !!user?.is_blocked;
  const { card, rest } = buildAppealCard(appeal, attachments.length, blocked);
  const buttons = appealButtons(appeal, blocked);
  let delivered = 0;

  for (const chatId of config.adminChatIds) {
    try {
      let header;
      let tail = rest;
      try {
        header = await bot.api.sendMessage(chatId, card, { parse_mode: 'HTML', reply_markup: buttons });
      } catch (err) {
        /* Karta qabul qilinmasa (uzunlik, razmetka) — eng kichik karta bilan
           baribir yetkazamiz, aks holda murojaat dekanat uchun ko'rinmas bo'ladi */
        log.warn('karta yuborilmadi, qisqartirilgan karta yuboriladi', { code: appeal.code, error: String(err.message) });
        header = await bot.api.sendMessage(chatId, minimalAppealCard(appeal, blocked), { parse_mode: 'HTML', reply_markup: buttons });
        tail = splitBodyForCard(appeal.body, 600).rest;
      }
      store.addRoute(chatId, header.message_id, appeal.id, 1);
      delivered++;

      await sendAppealBodyTail(chatId, appeal, header.message_id, tail);

      /* Fayllarni kartaning tagiga ilova qilamiz */
      for (const attachment of attachments.slice(0, config.maxAttachmentsPerAppeal)) {
        try {
          const sent = await sendAttachment(chatId, attachment, header.message_id);
          if (sent?.message_id) store.addRoute(chatId, sent.message_id, appeal.id, 0);
        } catch (err) {
          log.warn('ilova yuborilmadi', { code: appeal.code, error: String(err.message) });
          await bot.api.sendMessage(chatId, `⚠️ <code>${appeal.code}</code> ilovasini yuborib bo'lmadi: ${escapeHtml(String(err.message).slice(0, 120))}`,
            { parse_mode: 'HTML' }).catch(() => {});
        }
      }
    } catch (err) {
      log.error('murojaat adminga yetkazilmadi', { chat_id: chatId, code: appeal.code, error: String(err.message) });
    }
  }

  if (!delivered) {
    log.error('MUROJAAT HECH QAYSI ADMIN CHATIGA YETMADI', { code: appeal.code });
  }
  return delivered;
}

/** Holat o'zgarsa, admin chatidagi kartani yangilaymiz */
async function refreshAppealCards(appeal) {
  const user = store.getUser(appeal.tg_id);
  const count = store.countAttachments(appeal.id);
  const blocked = !!user?.is_blocked;
  const card = appealCard(appeal, count, blocked);
  const buttons = appealButtons(appeal, blocked);
  for (const route of store.listHeaderRoutes(appeal.id)) {
    try {
      await bot.api.editMessageText(route.chat_id, route.message_id, card, { parse_mode: 'HTML', reply_markup: buttons });
    } catch (err) {
      /* "message is not modified" — muammo emas */
      if (!String(err.description || err.message).includes('not modified')) {
        log.warn('kartani yangilab bo\'lmadi', { code: appeal.code, error: String(err.message) });
      }
    }
  }
}

/* =====================================================================
   FUQARO: BUYRUQLAR
   ===================================================================== */
async function sendWelcome(ctx) {
  await ctx.reply(welcomeText(fullName(ctx.from)), { parse_mode: 'HTML', reply_markup: mainKeyboard() });
}

async function sendHelp(ctx) {
  if (ctx.state?.adminChat) {
    await ctx.reply(adminHelpText(), { parse_mode: 'HTML' });
    return;
  }
  await ctx.reply(helpText(), { parse_mode: 'HTML', reply_markup: mainKeyboard() });
}

async function sendMyAppeals(ctx) {
  const rows = store.listUserAppeals(ctx.from.id, 10);
  if (!rows.length) {
    await ctx.reply('Sizda hali murojaat yo\'q. Murojaatingizni shu yerga yozib yuboravering.', { reply_markup: mainKeyboard() });
    return;
  }
  const lines = rows.map((a) =>
    `<code>${a.code}</code> · ${new Date(a.created_at).toLocaleDateString('uz-UZ', { timeZone: 'Asia/Tashkent' })}\n` +
    `${STATUS_LABEL[a.status] || a.status} — ${escapeHtml(cut(a.body, 70))}`);
  await ctx.reply(`<b>Oxirgi murojaatlaringiz (${rows.length})</b>\n\n${lines.join('\n\n')}\n\n` +
    `Batafsil: <code>/holat ${rows[0].code}</code>`, { parse_mode: 'HTML' });
}

async function sendStatus(ctx, argument) {
  const code = sanitizeText(argument, 32);
  if (!code) {
    await ctx.reply(`Murojaat raqamini ham yozing:\n<code>/holat MR-${new Date().getFullYear()}-0007</code>`, { parse_mode: 'HTML' });
    return;
  }
  const appeal = store.getAppealByCode(code);
  if (!appeal || appeal.tg_id !== ctx.from.id) {
    await ctx.reply('🔍 Bunday raqamli murojaatingiz topilmadi. Raqamni tekshirib qayta yuboring.');
    return;
  }
  const replies = store.listReplies(appeal.id).filter((r) => r.delivered);
  let text = `🔖 <code>${appeal.code}</code>\n` +
    `Holati: <b>${STATUS_LABEL[appeal.status]}</b>\n` +
    `Yuborilgan: ${localTime(appeal.created_at)}\n\n` +
    `<b>Matn:</b>\n${escapeHtml(cut(appeal.body, 900))}`;
  if (replies.length) {
    const last = replies[replies.length - 1];
    text += `\n\n<b>Dekanat javobi</b> (${new Date(last.created_at).toLocaleDateString('uz-UZ')}):\n${escapeHtml(cut(last.body, 900))}`;
  } else {
    text += '\n\n⏳ Javob hali kelmagan.';
  }
  await ctx.reply(text, { parse_mode: 'HTML' });
}

bot.command('start', (ctx) => (ctx.state?.adminChat ? sendHelp(ctx) : sendWelcome(ctx)));
bot.command(['yordam', 'help'], sendHelp);
bot.command(['murojaatlarim', 'my'], (ctx) => (ctx.state?.adminChat ? sendHelp(ctx) : sendMyAppeals(ctx)));
bot.command(['holat', 'status'], (ctx) => (ctx.state?.adminChat ? sendHelp(ctx) : sendStatus(ctx, ctx.match)));

function parseCommand(text) {
  const match = /^\/([A-Za-z0-9_]{1,32})(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/.exec(String(text).trim());
  return match ? { name: match[1].toLowerCase(), argument: match[2] || '' } : null;
}

/* =====================================================================
   FUQARO: TELEFON RAQAMI
   ===================================================================== */
bot.on('message:contact', async (ctx) => {
  if (ctx.state?.adminChat || !ctx.state?.isPrivate) return;
  const contact = ctx.message.contact;
  if (contact.user_id !== ctx.from.id) {
    await ctx.reply('Iltimos, pastdagi <b>«📞 Raqamni ulashish»</b> tugmasi orqali faqat ' +
      '<b>o\'z</b> raqamingizni yuboring.', { parse_mode: 'HTML', reply_markup: mainKeyboard() });
    return;
  }
  const phone = sanitizeText(contact.phone_number, 24);
  store.setUserPhone(ctx.from.id, phone);
  const recent = store.getRecentAppealOfUser(ctx.from.id, Date.now() - 7 * 24 * 3600_000);
  if (recent) {
    store.setAppealPhone(recent.id, phone);
    /* Dekanat kartasida ham darhol ko'rinsin */
    await refreshAppealCards(store.getAppeal(recent.id)).catch(() => {});
  }
  await ctx.reply('📞 Rahmat, raqamingiz saqlandi. Kerak bo\'lsa dekanat shu raqam orqali bog\'lanadi.',
    { reply_markup: mainKeyboard() });
});

/* =====================================================================
   FUQARO: FAYLLAR
   ===================================================================== */
function extractAttachment(message) {
  if (message.photo?.length) {
    const best = message.photo[message.photo.length - 1];
    return { kind: 'photo', fileId: best.file_id, fileSize: best.file_size, fileName: 'rasm.jpg' };
  }
  if (message.document) {
    const d = message.document;
    return { kind: 'document', fileId: d.file_id, fileName: sanitizeText(d.file_name, 120) || 'hujjat', fileSize: d.file_size };
  }
  if (message.voice) return { kind: 'voice', fileId: message.voice.file_id, fileName: 'ovozli-xabar.ogg', fileSize: message.voice.file_size };
  if (message.audio) return { kind: 'audio', fileId: message.audio.file_id, fileName: sanitizeText(message.audio.file_name, 120) || 'audio', fileSize: message.audio.file_size };
  if (message.video) return { kind: 'video', fileId: message.video.file_id, fileName: sanitizeText(message.video.file_name, 120) || 'video.mp4', fileSize: message.video.file_size };
  if (message.video_note) return { kind: 'video_note', fileId: message.video_note.file_id, fileName: 'video-xabar.mp4', fileSize: message.video_note.file_size };
  if (message.animation) return { kind: 'animation', fileId: message.animation.file_id, fileName: sanitizeText(message.animation.file_name, 120) || 'animatsiya.mp4', fileSize: message.animation.file_size };
  return null;
}

/* Fayllar bazada kutadi — qayta ishga tushish (Replit "Publish") ularni yo'qotmaydi */
function rememberPending(tgId, attachments) {
  const cap = Math.max(1, config.maxAttachmentsPerAppeal);
  for (const attachment of [].concat(attachments).filter(Boolean)) {
    if (store.countPendingAttachments(tgId) >= cap) break;
    try { store.addPendingAttachment(tgId, attachment, PENDING_TTL_MS); }
    catch (err) { log.warn('kutayotgan faylni saqlash xatosi', { error: String(err.message) }); }
  }
  store.prunePendingAttachments();
}

/** @returns {{items: object[], expired: number}} */
function takePending(tgId) {
  try { return store.takePendingAttachments(tgId, Math.max(1, config.maxAttachmentsPerAppeal)); }
  catch (err) {
    log.warn('kutayotgan fayllarni olish xatosi', { error: String(err.message) });
    return { items: [], expired: 0 };
  }
}

function bufferAlbumItem(ctx, attachment) {
  const key = `${ctx.from.id}:${ctx.message.media_group_id}`;
  const cap = Math.max(1, config.maxAttachmentsPerAppeal);
  let album = albums.get(key);
  if (!album) {
    album = { items: [], caption: '', dropped: 0, createdAt: Date.now(), chatId: ctx.chat.id, tgId: ctx.from.id, messageId: ctx.message.message_id, timer: null };
    albums.set(key, album);
    if (albums.size > 1000) {
      const cutoff = Date.now() - 3 * ALBUM_WAIT_MS;
      for (const [otherKey, value] of albums) {
        if (otherKey !== key && value.createdAt < cutoff) { clearTimeout(value.timer); albums.delete(otherKey); }
      }
    }
  }
  if (album.items.length < cap) album.items.push(attachment); else album.dropped++;

  const caption = sanitizeText(ctx.message.caption, config.appealMaxLength);
  if (caption && !album.caption) { album.caption = caption; album.messageId = ctx.message.message_id; }

  clearTimeout(album.timer);
  album.timer = setTimeout(() => {
    finishAlbum(ctx, key).catch((err) => log.warn('albomni qayta ishlashda xato', { error: String(err.message) }));
  }, ALBUM_WAIT_MS);
  album.timer.unref?.();
}

async function finishAlbum(ctx, key) {
  const album = albums.get(key);
  if (!album) return;
  albums.delete(key);
  clearTimeout(album.timer);

  const extra = album.dropped ? `\n\n⚠️ Faqat dastlabki ${config.maxAttachmentsPerAppeal} ta fayl qabul qilindi.` : '';

  if (album.caption.length >= config.appealMinLength) {
    await createAppeal(ctx, album.caption, { attachments: album.items, messageId: album.messageId, note: extra });
    return;
  }

  const recent = store.getRecentAppealOfUser(album.tgId, Date.now() - 30 * 60_000);
  if (recent) {
    const free = Math.max(0, config.maxAttachmentsPerAppeal - store.countAttachments(recent.id));
    const added = [];
    for (const item of album.items.slice(0, free)) {
      /* Qayta yetkazilgan albom qismlari ikkilanmasin */
      if (store.addAttachment(recent.id, item)) added.push(item);
    }
    if (added.length) {
      store.touchAppeal(recent.id);
      await forwardExtraAttachments(recent, added);
    }
    await bot.api.sendMessage(album.chatId, added.length
      ? `📎 ${added.length} ta fayl <code>${recent.code}</code> murojaatingizga qo'shildi.${extra}`
      : `📎 Bu murojaatga ${config.maxAttachmentsPerAppeal} tadan ko'p fayl qo'shib bo'lmaydi.`,
      { parse_mode: 'HTML' }).catch(() => {});
    return;
  }

  rememberPending(album.tgId, album.items);
  await bot.api.sendMessage(album.chatId,
    `📎 ${album.items.length} ta fayl qabul qilindi. Endi murojaatingizni <b>matn bilan</b> yozib yuboring.${extra}`,
    { parse_mode: 'HTML' }).catch(() => {});
}

/** Murojaat yuborilgandan keyin qo'shilgan fayllarni adminga yetkazamiz */
async function forwardExtraAttachments(appeal, attachments) {
  for (const route of store.listHeaderRoutes(appeal.id)) {
    for (const attachment of attachments) {
      try {
        const sent = await sendAttachment(route.chat_id, attachment, route.message_id);
        if (sent?.message_id) store.addRoute(route.chat_id, sent.message_id, appeal.id, 0);
      } catch (err) {
        log.warn('qo\'shimcha ilova yuborilmadi', { code: appeal.code, error: String(err.message) });
      }
    }
  }
  await refreshAppealCards(appeal);
}

bot.on(['message:photo', 'message:document', 'message:voice', 'message:audio', 'message:video', 'message:video_note', 'message:animation'], async (ctx) => {
  if (ctx.state?.adminChat) return handleAdminMessage(ctx);
  if (!ctx.state?.isPrivate) return;

  const attachment = extractAttachment(ctx.message);
  if (!attachment) return;

  if (attachment.fileSize && attachment.fileSize > config.maxAttachmentMb * 1024 * 1024) {
    const bigCaption = sanitizeText(ctx.message.caption, config.appealMaxLength);
    /* Izohda to'liq murojaat bo'lsa — matnni yo'qotmaymiz, faqat fayl rad etiladi */
    if (bigCaption.length >= config.appealMinLength) {
      await createAppeal(ctx, bigCaption, {
        note: `\n\n⚠️ Fayl ${config.maxAttachmentMb} MB dan katta bo'lgani uchun biriktirilmadi — ` +
          'kichikroq qilib (yoki bo\'lib) qayta yuboring.',
      });
      return;
    }
    await ctx.reply(`📎 Fayl juda katta (${config.maxAttachmentMb} MB gacha mumkin). Kichikroq fayl yuboring.`);
    return;
  }

  if (ctx.message.media_group_id) { bufferAlbumItem(ctx, attachment); return; }

  const caption = sanitizeText(ctx.message.caption, config.appealMaxLength);
  if (caption.length >= config.appealMinLength) {
    await createAppeal(ctx, caption, { attachments: [attachment] });
    return;
  }

  const recent = store.getRecentAppealOfUser(ctx.from.id, Date.now() - 30 * 60_000);
  if (recent) {
    if (store.countAttachments(recent.id) >= config.maxAttachmentsPerAppeal) {
      await ctx.reply(`📎 Bu murojaatga ${config.maxAttachmentsPerAppeal} tadan ko'p fayl qo'shib bo'lmaydi.`);
      return;
    }
    if (!store.addAttachment(recent.id, attachment)) {
      /* Telegram o'sha update'ni qayta yetkazgan — fayl allaqachon biriktirilgan */
      await ctx.reply(`📎 Bu fayl <code>${recent.code}</code> murojaatingizga allaqachon biriktirilgan.`, { parse_mode: 'HTML' });
      return;
    }
    store.touchAppeal(recent.id);
    await forwardExtraAttachments(recent, [attachment]);
    await ctx.reply(`📎 Fayl <code>${recent.code}</code> murojaatingizga qo'shildi.`, { parse_mode: 'HTML' });
    return;
  }

  rememberPending(ctx.from.id, attachment);
  await ctx.reply('📎 Fayl qabul qilindi. Endi murojaatingizni <b>matn bilan</b> yozib yuboring.', { parse_mode: 'HTML' });
});

/* =====================================================================
   ASOSIY OQIM: matn → murojaat
   ===================================================================== */
bot.on('message:text', async (ctx) => {
  if (ctx.state?.adminChat) return handleAdminMessage(ctx);
  if (!ctx.state?.isPrivate) return;

  const raw = ctx.message.text || '';
  if (raw.startsWith('/')) {
    const command = parseCommand(raw);
    switch (command && command.name) {
      case 'start': return sendWelcome(ctx);
      case 'yordam': case 'help': return sendHelp(ctx);
      case 'murojaatlarim': case 'my': return sendMyAppeals(ctx);
      case 'holat': case 'status': return sendStatus(ctx, command.argument);
      default:
        await ctx.reply('Bunday buyruq yo\'q. /yordam — qo\'llanma.\nMurojaatingizni oddiy xabar qilib yozsangiz ham bo\'ladi.');
        return;
    }
  }
  if (raw === BTN.myAppeals) return sendMyAppeals(ctx);
  if (raw === BTN.help) return ctx.reply(helpText(), { parse_mode: 'HTML' });
  if (raw === BTN.phone) return ctx.reply('Pastdagi «📞 Raqamni ulashish» tugmasini bosing.', { reply_markup: mainKeyboard() });

  /* Chegarani tekshirishdan oldin kesmaymiz — aks holda fuqaroga noto'g'ri
     uzunlik aytiladi */
  const body = sanitizeText(raw, 100_000);
  if (body.length < config.appealMinLength) {
    await ctx.reply(`✍️ Murojaatingizni to'liqroq yozing — kamida ${config.appealMinLength} belgi.\n` +
      'Muammo yoki taklifingizni bir-ikki gap bilan tushuntirib bering.');
    return;
  }
  if (body.length > config.appealMaxLength) {
    await ctx.reply(`✍️ Matn juda uzun (${body.length} belgi). ${config.appealMaxLength} belgigacha qisqartiring yoki ` +
      'batafsil ma\'lumotni hujjat qilib yuboring.');
    return;
  }
  await createAppeal(ctx, body);
});

function checkLimits(tgId) {
  const nowMs = Date.now();
  const sinceLast = nowMs - store.lastAppealAt(tgId);
  if (sinceLast < config.appealCooldownSeconds * 1000) {
    return { ok: false, message: `⏱ Juda tez yubordingiz. ${Math.ceil((config.appealCooldownSeconds * 1000 - sinceLast) / 1000)} soniyadan so'ng qayta urinib ko'ring.` };
  }
  if (store.countAppealsSince(tgId, nowMs - 3600_000) >= config.appealsPerHour) {
    return { ok: false, message: `⏱ Soat ichida ${config.appealsPerHour} ta murojaat chegarasiga yetdingiz. Bir ozdan keyin urinib ko'ring.` };
  }
  if (store.countAppealsSince(tgId, nowMs - 24 * 3600_000) >= config.appealsPerDay) {
    return { ok: false, message: `⏱ Kun ichida ${config.appealsPerDay} ta murojaat chegarasiga yetdingiz. Ertaga davom etasiz.` };
  }
  return { ok: true };
}

/** Fuqaro dekanat javobiga «reply» qilsa — qaysi murojaatga tegishli ekanini topamiz */
function relatedAppealCode(ctx) {
  const quoted = ctx.message?.reply_to_message;
  const quotedText = quoted?.text || quoted?.caption || '';
  if (!quotedText) return null;
  const match = /MR-\d{4}-[A-Za-z0-9]+/.exec(quotedText);
  if (!match) return null;
  const previous = store.getAppealByCode(match[0]);
  return previous && previous.tg_id === ctx.from.id ? previous.code : null;
}

async function createAppeal(ctx, body, { attachments = [], messageId = null, note = '' } = {}) {
  const chatId = ctx.chat.id;
  const say = (text, options = {}) => bot.api.sendMessage(chatId, text, options).catch(() => {});

  const limit = checkLimits(ctx.from.id);
  if (!limit.ok) {
    await say(limit.message + (attachments.length ? '\n\n📎 Yuborgan faylingiz saqlanmadi — murojaat bilan birga qayta yuboring.' : ''));
    return { ok: false };
  }

  const user = store.getUser(ctx.from.id);
  let appeal;
  try {
    appeal = store.createAppeal({
      tgId: ctx.from.id,
      authorName: fullName(ctx.from),
      authorUsername: ctx.from.username || null,
      authorPhone: user?.phone || null,
      body,
      chatId,
      messageId: messageId || ctx.message.message_id,
      relatedCode: relatedAppealCode(ctx),
    });
  } catch (err) {
    log.error('murojaatni saqlashda xato', { error: String(err.message) });
    await say('⚠️ Texnik nosozlik sababli murojaat saqlanmadi. Iltimos, bir ozdan keyin qayta yuboring.');
    return { ok: false };
  }

  if (appeal.duplicate) { log.info('takroriy update e\'tiborsiz qoldirildi', { code: appeal.code }); return { ok: true, duplicate: true }; }

  const pending = takePending(ctx.from.id);
  const all = [...pending.items, ...attachments].slice(0, Math.max(1, config.maxAttachmentsPerAppeal));
  for (const attachment of all) {
    try { store.addAttachment(appeal.id, attachment); } catch (err) { log.warn('ilovani saqlash xatosi', { error: String(err.message) }); }
  }

  const expiredNote = pending.expired
    ? `\n\n⚠️ Avval yuborgan ${pending.expired} ta faylning kutish muddati (10 daqiqa) o'tgani uchun ` +
      'biriktirilmadi — kerak bo\'lsa qayta yuboring.'
    : '';

  const delivered = await sendAppealToAdmins(appeal, all);
  await say(confirmText(appeal, all.length) + note + expiredNote +
    (delivered ? '' : '\n\n⚠️ Texnik sabab bilan dekanatga yetkazishda kechikish bo\'lishi mumkin.'),
    { parse_mode: 'HTML', reply_markup: mainKeyboard() });
  return { ok: true, appeal };
}

/* Qolgan turlar: stiker, joylashuv, so'rovnoma va h.k. */
bot.on('message', async (ctx) => {
  if (ctx.state?.adminChat) return handleAdminMessage(ctx);
  if (!ctx.state?.isPrivate) return;
  await ctx.reply('✍️ Murojaatingizni <b>matn</b> bilan yozib yuboring.\n' +
    'Rasm, hujjat yoki ovozli xabarni esa murojaat matniga ilova qilsangiz bo\'ladi.',
    { parse_mode: 'HTML', reply_markup: mainKeyboard() });
});

/* =====================================================================
   ADMIN: javob, buyruqlar, tugmalar
   ===================================================================== */
async function deliverReply(appeal, body, { author, attachments = [], source = null } = {}) {
  const plain = String(body || '').trim();
  const record = store.addReply(appeal.id, {
    author,
    body: plain || `📎 ${attachments.length} ta ilova`,
    source,
  });
  /* Telegram update'ni qayta yetkazgan — javob allaqachon yuborilgan */
  if (record.duplicate) {
    log.info('takroriy javob e\'tiborsiz qoldirildi', { code: appeal.code });
    return { ok: true, duplicate: true };
  }
  const replyId = record.id;
  const header = `📬 <b>Dekanat javobi</b>\n🔖 Murojaat: <code>${appeal.code}</code>\n\n`;
  const footer = `\n\n<i>${escapeHtml(config.facultyName)}</i>`;
  const budget = 4096 - header.length - footer.length - 64;
  const chunks = plain ? splitForTelegram(plain, budget) : [];
  let delivered = 0;
  let failedFiles = 0;

  try {
    if (!chunks.length) {
      /* Matnsiz javob — faqat fayl(lar) */
      await sendWithRetry(appeal.chat_id, `${header}📎 Dekanat ${attachments.length} ta fayl yubordi.${footer}`, {
        parse_mode: 'HTML',
        reply_parameters: appeal.message_id ? { message_id: appeal.message_id, allow_sending_without_reply: true } : undefined,
      });
      delivered++;
    }
    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) await sleep(1100);
      const text = (i === 0 ? header : `📬 <b>Javob (davomi ${i + 1}/${chunks.length})</b>\n\n`) +
        escapeHtml(chunks[i]) + (i === chunks.length - 1 ? footer : '');
      await sendWithRetry(appeal.chat_id, text, {
        parse_mode: 'HTML',
        reply_parameters: i === 0 && appeal.message_id ? { message_id: appeal.message_id, allow_sending_without_reply: true } : undefined,
      });
      delivered++;
    }
    /* Dekanat javobga fayl ilova qilgan bo'lsa — fuqaroga ham yuboramiz */
    for (const attachment of attachments) {
      try {
        await sendAttachment(appeal.chat_id, attachment, appeal.message_id);
      } catch (err) {
        failedFiles++;
        log.warn('javob ilovasi yetkazilmadi', { code: appeal.code, error: String(err.message) });
      }
    }

    /* Javob FAQAT fayldan iborat bo'lib, fayl(lar) yetmagan bo'lsa — bu
       yetkazilmagan javob: holatni «javob berilgan» qilmaymiz */
    if (attachments.length && failedFiles === attachments.length) {
      const reason = `${failedFiles} ta fayl yuborilmadi`;
      store.markReplyDelivered(replyId, false, reason);
      return { ok: false, error: reason, failedFiles };
    }

    store.markReplyDelivered(replyId, true, failedFiles ? `${failedFiles} ta fayl yuborilmadi` : null);
    if (appeal.status !== 'closed') {
      const updated = store.setAppealStatus(appeal.id, 'answered');
      await refreshAppealCards(updated);
    }
    return { ok: true, files: attachments.length - failedFiles, failedFiles };
  } catch (err) {
    const reason = err instanceof GrammyError ? err.description : String(err.message);
    const detail = delivered > 0 && chunks.length > 1 ? `${delivered}/${chunks.length} bo'lak yetkazildi: ${reason}` : reason;
    store.markReplyDelivered(replyId, false, detail);
    log.warn('javob yetkazilmadi', { code: appeal.code, error: detail });
    return { ok: false, error: detail };
  }
}

function splitForTelegram(body, budget) {
  const parts = [];
  let current = '';
  let currentLength = 0;
  const flush = () => { const t = current.trim(); if (t) parts.push(t); current = ''; currentLength = 0; };

  for (const token of String(body).split(/(\s+)/)) {
    if (!token) continue;
    const tokenLength = escapeHtml(token).length;
    if (tokenLength > budget) {
      flush();
      for (const ch of Array.from(token)) {
        const chLength = escapeHtml(ch).length;
        if (currentLength + chLength > budget) flush();
        current += ch; currentLength += chLength;
      }
      continue;
    }
    if (currentLength + tokenLength > budget) flush();
    current += token; currentLength += tokenLength;
  }
  flush();
  return parts.length ? parts : [String(body)];
}

async function sendWithRetry(chatId, text, options, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    try { return await bot.api.sendMessage(chatId, text, options); }
    catch (err) {
      const retryAfter = err instanceof GrammyError ? err.parameters?.retry_after : null;
      if (!retryAfter || attempt >= attempts) throw err;
      await sleep((retryAfter + 1) * 1000);
    }
  }
}

/** Admin chatidan kelgan har qanday xabar */
/* Dekanat buyruqlari. Faqat shu ro'yxatdagi so'zlar buyruq hisoblanadi —
   aks holda «/» bilan boshlangan JAVOB buyruq deb tashlab yuborilardi. */
const ADMIN_COMMANDS = new Set([
  'javob', 'murojaat', 'karta', 'navbat', 'statistika', 'kechikkanlar',
  'bloklash', 'blokdan', 'bloklanganlar', 'zaxira', 'start', 'yordam', 'help',
]);

async function handleAdminMessage(ctx) {
  const text = ctx.message?.text || ctx.message?.caption || '';
  const parsed = text.startsWith('/') ? parseCommand(text) : null;
  const command = parsed && ADMIN_COMMANDS.has(parsed.name) ? parsed : null;

  if (command) {
    if (!ctx.state.admin) {
      await ctx.reply('⛔️ Sizda dekanat buyruqlaridan foydalanish huquqi yo\'q.');
      return;
    }
    switch (command.name) {
      case 'javob': return adminReplyByCode(ctx, command.argument);
      case 'murojaat': case 'karta': return adminShowAppeal(ctx, command.argument);
      case 'navbat': return adminRetryQueue(ctx);
      case 'statistika': return adminStats(ctx);
      case 'kechikkanlar': return adminOverdue(ctx);
      case 'bloklash': return adminBlock(ctx, command.argument, true);
      case 'blokdan': return adminBlock(ctx, command.argument, false);
      case 'bloklanganlar': return adminBlockedList(ctx);
      case 'zaxira': {
        /* Bazada fuqarolarning telefon raqami va murojaat matnlari bor — guruhga tashlamaymiz */
        const privateTarget = ctx.state.isPrivate
          ? ctx.chat.id
          : (config.backupChatId > 0 ? config.backupChatId : ctx.from.id);
        await ctx.reply(ctx.state.isPrivate
          ? '💾 Zaxira tayyorlanmoqda…'
          : '💾 Zaxira tayyorlanmoqda — maxfiylik uchun u <b>shaxsiy chatga</b> yuboriladi.',
          { parse_mode: 'HTML' });
        const result = await sendBackupToTelegram({ force: true, chatId: privateTarget });
        if (result.sent && !ctx.state.isPrivate) {
          await ctx.reply(`✅ Zaxira shaxsiy chatga yuborildi (<code>${privateTarget}</code>).`, { parse_mode: 'HTML' });
        }
        if (!result.sent) {
          await ctx.reply(`⚠️ Yuborilmadi: ${escapeHtml(result.error || result.reason)}\n` +
            'Agar bot sizga yozolmasa — botga shaxsiy «/start» yuboring.', { parse_mode: 'HTML' });
        }
        return;
      }
      case 'start': case 'yordam': case 'help': return sendHelp(ctx);
      default: break;      /* ADMIN_COMMANDS bu holatga yo'l qo'ymaydi */
    }
  }

  /* "Reply" — murojaatga javob */
  const replyTo = ctx.message?.reply_to_message;
  const route = replyTo ? store.findRoute(ctx.chat.id, replyTo.message_id) : null;
  if (route) {
    if (!ctx.state.admin) { await ctx.reply('⛔️ Sizda javob berish huquqi yo\'q.'); return; }
    const appeal = store.getAppeal(route.appeal_id);
    if (!appeal) { await ctx.reply('Murojaat topilmadi.'); return; }

    const attachment = extractAttachment(ctx.message);
    /* Bir nechta fayl birga kelsa (albom) — yig'ib, bitta javob qilib yuboramiz */
    if (attachment && ctx.message.media_group_id) { bufferAdminAlbum(ctx, appeal, attachment); return; }

    const body = sanitizeText(text, ADMIN_REPLY_MAX);
    if (!attachment && body.length < 2) { await ctx.reply('Javob matnini yozing.'); return; }
    const result = await deliverReply(appeal, body, {
      author: '@' + (ctx.from.username || fullName(ctx.from)),
      attachments: attachment ? [attachment] : [],
      source: { chatId: ctx.chat.id, messageId: ctx.message.message_id },
    });
    if (result.duplicate) return;
    await ctx.reply(replyOutcomeText(appeal, result), { parse_mode: 'HTML' });
    return;
  }

  /* Noma'lum buyruq (marshrut topilmadi — ya'ni javob ham emas) */
  if (parsed && ctx.state.admin) {
    await ctx.reply('Bunday buyruq yo\'q. /yordam — dekanat qo\'llanmasi.\n' +
      '<i>Agar bu murojaatga javob bo\'lsa — murojaat kartasiga «reply» qilib yozing.</i>',
      { parse_mode: 'HTML' });
    return;
  }

  /* Botning xabariga «reply» qilingan, lekin murojaat topilmadi */
  if (replyTo && replyTo.from?.id === ctx.me?.id) {
    await ctx.reply('⚠️ Bu xabarga bog\'langan murojaat topilmadi (xabar eski bo\'lishi mumkin).\n' +
      `Raqam bo'yicha javob bering: <code>/javob MR-${new Date().getFullYear()}-0007 matn</code>`, { parse_mode: 'HTML' });
    return;
  }

  /* Guruhdagi oddiy suhbatga aralashmaymiz — eslatma faqat shaxsiy chatda
     yoki bot nomi tilga olinganda chiqadi */
  const mentioned = ctx.me?.username && text.toLowerCase().includes('@' + ctx.me.username.toLowerCase());
  if (!ctx.state.isPrivate && !mentioned) return;

  await ctx.reply('ℹ️ Bu — dekanat chati. Javob berish uchun murojaat xabariga «reply» qiling ' +
    'yoki <code>/javob MR-… matn</code> yozing. /yordam', { parse_mode: 'HTML' });
}

/** Javob yuborilgandan keyin dekanatga ko'rsatiladigan xulosa */
function replyOutcomeText(appeal, result) {
  if (!result.ok) return `⚠️ Yuborilmadi: ${escapeHtml(result.error || '')}`;
  const files = result.files ? ` 📎 ${result.files} ta fayl bilan.` : '';
  const failed = result.failedFiles ? `\n⚠️ ${result.failedFiles} ta fayl yuborilmadi.` : '';
  return `✅ Javob <code>${appeal.code}</code> muallifiga yuborildi.${files}${failed}`;
}

/** Dekanat javobiga ilova qilingan albomni yig'ib, bitta javob qilib yuboradi */
function bufferAdminAlbum(ctx, appeal, attachment) {
  const key = `${ctx.chat.id}:${ctx.message.media_group_id}`;
  const cap = Math.max(1, config.maxAttachmentsPerAppeal);
  let album = adminAlbums.get(key);
  if (!album) {
    album = {
      items: [], caption: '', appealId: appeal.id, chatId: ctx.chat.id,
      author: '@' + (ctx.from.username || fullName(ctx.from)),
      source: { chatId: ctx.chat.id, messageId: ctx.message.message_id },
      createdAt: Date.now(), timer: null,
    };
    adminAlbums.set(key, album);
    if (adminAlbums.size > 200) {
      const cutoff = Date.now() - 3 * ALBUM_WAIT_MS;
      for (const [otherKey, value] of adminAlbums) {
        if (otherKey !== key && value.createdAt < cutoff) { clearTimeout(value.timer); adminAlbums.delete(otherKey); }
      }
    }
  }
  if (album.items.length < cap) album.items.push(attachment);

  const caption = sanitizeText(ctx.message.caption, ADMIN_REPLY_MAX);
  if (caption && !album.caption) album.caption = caption;

  clearTimeout(album.timer);
  album.timer = setTimeout(() => {
    finishAdminAlbum(key).catch((err) => log.warn('javob albomida xato', { error: String(err.message) }));
  }, ALBUM_WAIT_MS);
  album.timer.unref?.();
}

async function finishAdminAlbum(key) {
  const album = adminAlbums.get(key);
  if (!album) return;
  adminAlbums.delete(key);
  clearTimeout(album.timer);

  const appeal = store.getAppeal(album.appealId);
  if (!appeal) return;
  const result = await deliverReply(appeal, album.caption, {
    author: album.author, attachments: album.items, source: album.source,
  });
  if (result.duplicate) return;
  await bot.api.sendMessage(album.chatId, replyOutcomeText(appeal, result), { parse_mode: 'HTML' }).catch(() => {});
}

async function adminReplyByCode(ctx, argument) {
  const match = /^(MR-\d{4}-[A-Za-z0-9]+)\s+([\s\S]+)$/i.exec(String(argument).trim());
  if (!match) {
    await ctx.reply(`Foydalanish: <code>/javob MR-${new Date().getFullYear()}-0007 javob matni</code>`, { parse_mode: 'HTML' });
    return;
  }
  const appeal = store.getAppealByCode(match[1]);
  if (!appeal) { await ctx.reply('Bunday raqamli murojaat topilmadi.'); return; }
  const result = await deliverReply(appeal, sanitizeText(match[2], ADMIN_REPLY_MAX), {
    author: '@' + (ctx.from.username || fullName(ctx.from)),
    source: { chatId: ctx.chat.id, messageId: ctx.message.message_id },
  });
  if (result.duplicate) return;
  await ctx.reply(replyOutcomeText(appeal, result), { parse_mode: 'HTML' });
}

/** /murojaat MR-2026-0007 — kartani (va fayllarni) qaytadan chiqarish */
async function adminShowAppeal(ctx, argument) {
  const code = sanitizeText(argument, 32).split(/\s+/)[0];
  if (!code) {
    await ctx.reply(`Foydalanish: <code>/murojaat MR-${new Date().getFullYear()}-0007</code>`, { parse_mode: 'HTML' });
    return;
  }
  const appeal = store.getAppealByCode(code);
  if (!appeal) { await ctx.reply('Bunday raqamli murojaat topilmadi.'); return; }

  const user = store.getUser(appeal.tg_id);
  const attachments = store.listAttachments(appeal.id, config.maxAttachmentsPerAppeal);
  const built = buildAppealCard(appeal, attachments.length, !!user?.is_blocked);
  const header = await ctx.reply(built.card, {
    parse_mode: 'HTML',
    reply_markup: appealButtons(appeal, !!user?.is_blocked),
  });
  store.addRoute(ctx.chat.id, header.message_id, appeal.id, 1);
  await sendAppealBodyTail(ctx.chat.id, appeal, header.message_id, built.rest);

  for (const attachment of attachments) {
    try {
      const sent = await sendAttachment(ctx.chat.id, attachment, header.message_id);
      if (sent?.message_id) store.addRoute(ctx.chat.id, sent.message_id, appeal.id, 0);
    } catch (err) {
      log.warn('ilovani qayta yuborib bo\'lmadi', { code: appeal.code, error: String(err.message) });
    }
  }

  const replies = store.listReplies(appeal.id);
  if (replies.length) {
    const last = replies[replies.length - 1];
    await ctx.reply(`📬 <b>Oxirgi javob</b> (${escapeHtml(last.author || '')}, ${localTime(last.created_at)})\n` +
      `${last.delivered ? '✅ yetkazildi' : '⚠️ yetkazilmadi'}\n\n${escapeHtml(cut(last.body, 900))}\n\n` +
      `<i>Jami javob: ${replies.length} ta</i>`, { parse_mode: 'HTML' });
  }
}

/** /navbat — dekanat chatiga yetib bormagan murojaatlarni qayta yuborish */
async function adminRetryQueue(ctx) {
  const result = await retryUndelivered({ limit: 20 });
  if (!result.tried) { await ctx.reply('✅ Navbatda yetib bormagan murojaat yo\'q.'); return; }
  await ctx.reply(result.fixed
    ? `✅ ${result.fixed} ta murojaat qayta yuborildi${result.tried > result.fixed ? `, ${result.tried - result.fixed} tasi hamon yetmadi` : ''}.`
    : `⚠️ ${result.tried} ta murojaat hamon yetkazilmadi — bot shu chatga yoza olmayapti.`);
}

async function adminStats(ctx) {
  const s = store.stats(config.slaHours * 3600_000);
  await ctx.reply(`📊 <b>Murojaatlar holati</b>\n\n` +
    `🆕 Yangi: <b>${s.new}</b>\n⏳ Ko'rilmoqda: <b>${s.inProgress}</b>\n` +
    `✅ Javob berilgan: <b>${s.answered}</b>\n🔒 Yopilgan: <b>${s.closed}</b>\n` +
    `⚠️ Kechikkan (${config.slaHours} soat+): <b>${s.overdue}</b>\n\n` +
    `Oxirgi 24 soat: ${s.last24h} ta\nJami: ${s.total} ta · Murojaat qilganlar: ${s.authors}\n` +
    `Bloklangan: ${s.blocked}`, { parse_mode: 'HTML' });
}

async function adminOverdue(ctx) {
  const rows = store.listOverdue(config.slaHours * 3600_000, 10);
  /* Yetib bormagan murojaatlar SLA'ni kutmasdan ko'rinishi kerak */
  const stuck = store.listUndelivered(Date.now() - 7 * 24 * 3600_000, 10);
  const describe = (a) => {
    const hours = Math.floor((Date.now() - a.created_at) / 3600_000);
    const age = hours >= 24 ? `${Math.floor(hours / 24)} kun` : `${hours} soat`;
    return `• <code>${a.code}</code> — ${age} (${escapeHtml(a.author_name || '')})\n  ${escapeHtml(cut(a.body, 80))}`;
  };

  const blocks = [];
  if (stuck.length) {
    blocks.push(`🚨 <b>Shu chatga yetib bormagan murojaatlar (${stuck.length})</b>\n` +
      `${stuck.map(describe).join('\n\n')}\n\n<i>Qayta yuborish: /navbat</i>`);
  }
  if (rows.length) {
    blocks.push(`⚠️ <b>Javobsiz murojaatlar (${rows.length})</b>\n\n${rows.map(describe).join('\n\n')}`);
  }
  if (!blocks.length) { await ctx.reply(`✅ ${config.slaHours} soatdan beri javobsiz murojaat yo'q.`); return; }
  await ctx.reply(blocks.join('\n\n━━━━━━━━━━━━━━━━━━━━\n\n'), { parse_mode: 'HTML' });
}

/** /bloklash MR-2026-0001 sabab  yoki  /bloklash 123456789 sabab */
async function adminBlock(ctx, argument, blocked) {
  const parts = String(argument).trim().split(/\s+/);
  const target = parts.shift() || '';
  const reason = sanitizeText(parts.join(' '), 200);
  if (!target) {
    await ctx.reply(`Foydalanish: <code>/${blocked ? 'bloklash' : 'blokdan'} MR-${new Date().getFullYear()}-0007</code> yoki ` +
      `<code>/${blocked ? 'bloklash' : 'blokdan'} 123456789</code>`, { parse_mode: 'HTML' });
    return;
  }
  let tgId = /^-?\d+$/.test(target) ? Number(target) : null;
  let appeal = null;
  if (tgId === null) {
    appeal = store.getAppealByCode(target);
    if (!appeal) { await ctx.reply('Bunday raqamli murojaat topilmadi.'); return; }
    tgId = appeal.tg_id;
  }
  if (!store.getUser(tgId)) { await ctx.reply('Bunday foydalanuvchi topilmadi.'); return; }

  store.setUserBlocked(tgId, blocked, reason);
  await ctx.reply(blocked
    ? `⛔️ <code>${tgId}</code> bloklandi.${reason ? ' Sabab: ' + escapeHtml(reason) : ''}\nU endi murojaat yubora olmaydi.`
    : `♻️ <code>${tgId}</code> blokdan chiqarildi.`, { parse_mode: 'HTML' });
  if (appeal) await refreshAppealCards(store.getAppeal(appeal.id));
}

async function adminBlockedList(ctx) {
  const rows = store.listBlocked(20);
  if (!rows.length) { await ctx.reply('Bloklangan foydalanuvchilar yo\'q.'); return; }
  const lines = rows.map((u) => `• <code>${u.tg_id}</code> ${escapeHtml([u.first_name, u.last_name].filter(Boolean).join(' '))}` +
    (u.block_reason ? ` — ${escapeHtml(u.block_reason)}` : ''));
  await ctx.reply(`⛔️ <b>Bloklanganlar (${rows.length})</b>\n\n${lines.join('\n')}\n\n` +
    `Blokdan chiqarish: <code>/blokdan &lt;ID&gt;</code>`, { parse_mode: 'HTML' });
}

/* ------------------------------ Tugmalar ---------------------------- */
bot.on('callback_query:data', async (ctx) => {
  if (!ctx.state?.adminChat) { await ctx.answerCallbackQuery({ text: 'Ruxsat yo\'q', show_alert: true }); return; }
  if (!ctx.state.admin) { await ctx.answerCallbackQuery({ text: 'Sizda huquq yo\'q', show_alert: true }); return; }

  const data = ctx.callbackQuery.data || '';
  const statusMatch = /^st:(\d+):(new|in_progress|answered|closed)$/.exec(data);
  const blockMatch = /^blk:(\d+)$/.exec(data);

  if (statusMatch) {
    const appeal = store.getAppeal(Number(statusMatch[1]));
    if (!appeal) { await ctx.answerCallbackQuery({ text: 'Murojaat topilmadi', show_alert: true }); return; }
    const updated = store.setAppealStatus(appeal.id, statusMatch[2]);
    await ctx.answerCallbackQuery({ text: `${appeal.code}: ${STATUS_LABEL[statusMatch[2]]}` });
    await refreshAppealCards(updated);
    if (statusMatch[2] === 'in_progress') notifyAuthorInProgress(updated).catch(() => {});
    return;
  }

  if (blockMatch) {
    const appeal = store.getAppeal(Number(blockMatch[1]));
    if (!appeal) { await ctx.answerCallbackQuery({ text: 'Murojaat topilmadi', show_alert: true }); return; }
    const user = store.getUser(appeal.tg_id);
    const blocked = !user?.is_blocked;
    store.setUserBlocked(appeal.tg_id, blocked, blocked ? 'Telegram tugmasi orqali' : null);
    await ctx.answerCallbackQuery({ text: blocked ? 'Bloklandi' : 'Blokdan chiqarildi' });
    await refreshAppealCards(store.getAppeal(appeal.id));
    return;
  }

  await ctx.answerCallbackQuery();
});

/* =====================================================================
   XABARNOMALAR: holat, kunlik xulosa, zaxira
   ===================================================================== */
async function notifyAuthorInProgress(appeal) {
  if (!config.notifyUserOnProgress || !appeal || appeal.progress_notified_at) return { ok: false };
  store.markProgressNotified(appeal.id);
  try {
    await bot.api.sendMessage(appeal.chat_id,
      `⏳ <b>Murojaatingiz ko'rib chiqilmoqda</b>\n🔖 <code>${appeal.code}</code>\n\n` +
      'Dekanat murojaatingizni qabul qilib, ish boshladi. Javob tayyor bo\'lishi bilan shu yerga yuboriladi.',
      { parse_mode: 'HTML' });
    return { ok: true };
  } catch (err) {
    log.warn('holat xabarnomasi yetkazilmadi', { code: appeal.code, error: String(err.message) });
    return { ok: false };
  }
}

/** Dekanat chatiga yetib bormagan murojaatlarni qayta yuborishga urinadi */
async function retryUndelivered({ limit = 5, windowMs = 48 * 3600_000 } = {}) {
  const rows = store.listUndelivered(Date.now() - windowMs, limit);
  let fixed = 0;
  for (const appeal of rows) {
    const attachments = store.listAttachments(appeal.id, config.maxAttachmentsPerAppeal);
    const delivered = await sendAppealToAdmins(appeal, attachments);
    if (delivered) {
      fixed++;
      log.info('yetib bormagan murojaat qayta yuborildi', { code: appeal.code });
    }
  }
  if (rows.length && !fixed) log.error('murojaatlar hamon dekanatga yetmayapti', { soni: rows.length });
  return { tried: rows.length, fixed };
}

async function sendDailyDigest({ force = false } = {}) {
  if (!config.adminChatIds.length) return { sent: false, reason: 'chat yo\'q' };
  const local = new Date(Date.now() + config.tzOffsetHours * 3600_000);
  const today = local.toISOString().slice(0, 10);
  if (!force) {
    if (local.getUTCHours() !== config.digestHour) return { sent: false, reason: 'vaqti emas' };
    if (store.getSetting('last_digest_date') === today) return { sent: false, reason: 'bugun yuborilgan' };
  }
  store.setSetting('last_digest_date', today);

  const s = store.stats(config.slaHours * 3600_000);
  const overdue = store.listOverdue(config.slaHours * 3600_000, 10);
  const lines = overdue.map((a) => {
    const hours = Math.floor((Date.now() - a.created_at) / 3600_000);
    const age = hours >= 24 ? `${Math.floor(hours / 24)} kun` : `${hours} soat`;
    return `• <code>${a.code}</code> — ${age} (${escapeHtml(a.author_name || '')})\n  ${escapeHtml(cut(a.body, 90))}`;
  });

  const stuck = store.listUndelivered(Date.now() - 7 * 24 * 3600_000, 5);
  const stuckBlock = stuck.length
    ? `🚨 <b>${stuck.length} ta murojaat shu chatga yetib bormagan:</b>\n` +
      `${stuck.map((a) => `• <code>${a.code}</code> — ${escapeHtml(cut(a.body, 60))}`).join('\n')}\n` +
      '<i>Qayta yuborish: /navbat</i>\n\n'
    : '';

  const text = `🗓 <b>Kunlik xulosa</b> — ${today}\n\n` +
    `🆕 Yangi: <b>${s.new}</b>   ⏳ Ko'rilmoqda: <b>${s.inProgress}</b>\n` +
    `✅ Javob berilgan: <b>${s.answered}</b>   📨 Oxirgi 24 soat: <b>${s.last24h}</b>\n\n` +
    stuckBlock +
    (overdue.length
      ? `⚠️ <b>${s.overdue} ta murojaat ${config.slaHours} soatdan beri javobsiz:</b>\n\n${lines.join('\n')}` +
        (s.overdue > overdue.length ? `\n\n…va yana ${s.overdue - overdue.length} ta.` : '')
      : '✅ Javobsiz qolgan murojaat yo\'q. Rahmat!');

  let sent = 0;
  for (const chatId of config.adminChatIds) {
    try { await bot.api.sendMessage(chatId, text, { parse_mode: 'HTML' }); sent++; }
    catch (err) { log.warn('kunlik xulosa yuborilmadi', { chat_id: chatId, error: String(err.message) }); }
  }
  return { sent: sent > 0, overdue: s.overdue };
}

async function sendBackupToTelegram({ force = false, chatId = null } = {}) {
  if (!config.backupToTelegram && !force) return { sent: false, reason: 'o\'chirilgan' };
  /* Zaxira — fuqarolarning ismi, telefoni va murojaat matnlari bo'lgan BAZA.
     Guruhga tashlansa, guruhga keyin qo'shilgan har kim ham yuklab oladi.
     Shuning uchun sukut bo'yicha faqat SHAXSIY chatga yuboriladi. */
  const target = chatId || config.backupChatId || config.adminChatIds.find((id) => id > 0) || 0;
  if (!target) {
    return { sent: false, reason: 'shaxsiy chat ko\'rsatilmagan — BACKUP_CHAT_ID ga o\'z Telegram ID\'ingizni yozing' };
  }
  if (target < 0 && !config.backupAllowGroup) {
    return {
      sent: false,
      reason: 'zaxira GURUHGA yuborilmaydi (bazada fuqarolarning telefon raqami va murojaatlari bor). ' +
        'BACKUP_CHAT_ID ga shaxsiy chat ID\'sini yozing yoki ataylab xohlasangiz BACKUP_ALLOW_GROUP=true qiling',
    };
  }

  const last = Number(store.getSetting('last_backup_at', 0));
  if (!force && Date.now() - last < config.backupHours * 3600_000) return { sent: false, reason: 'vaqti emas' };

  const stamp = new Date(Date.now() + config.tzOffsetHours * 3600_000).toISOString().replace(/[:T]/g, '-').slice(0, 16);
  const tmpFile = path.join(os.tmpdir(), `murojaat-${stamp}.db`);
  try {
    await store.backupTo(tmpFile);
    const packed = zlib.gzipSync(fs.readFileSync(tmpFile), { level: 9 });
    const s = store.stats(config.slaHours * 3600_000);
    await bot.api.sendDocument(target, new InputFile(packed, `murojaat-${stamp}.db.gz`), {
      caption: `💾 <b>Zaxira nusxa</b>\nMurojaatlar: <b>${s.total}</b> · Hajm: ${(packed.length / 1024 / 1024).toFixed(2)} MB\n\n` +
        `<i>Tiklash:</i> <code>npm run restore -- murojaat-${stamp}.db.gz</code>`,
      parse_mode: 'HTML',
      disable_notification: true,
    });
    store.setSetting('last_backup_at', Date.now());
    log.info(`zaxira yuborildi (${s.total} murojaat)`);
    return { sent: true, appeals: s.total };
  } catch (err) {
    const reason = err instanceof GrammyError ? err.description : String(err.message);
    log.error('zaxira yuborilmadi', { error: reason });
    return { sent: false, error: reason };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* yo'q */ }
  }
}

/* =====================================================================
   XATOLAR VA BUYRUQLAR RO'YXATI
   ===================================================================== */
bot.catch((err) => {
  const where = err.ctx?.update?.update_id ? `update ${err.ctx.update.update_id}` : 'bot';
  reportError(err.error, where);
});

async function setMyCommands() {
  await bot.api.setMyCommands([
    { command: 'start', description: 'Boshlash' },
    { command: 'murojaatlarim', description: 'Mening murojaatlarim' },
    { command: 'holat', description: 'Murojaat holati (raqam bilan)' },
    { command: 'yordam', description: 'Qo\'llanma' },
  ]);
}

module.exports = {
  bot, setMyCommands,
  sendAppealToAdmins, deliverReply, refreshAppealCards, retryUndelivered,
  notifyAuthorInProgress, sendDailyDigest, sendBackupToTelegram,
  STATUS_LABEL,
};
