'use strict';
/* =====================================================================
   TELEGRAM BOT — murojaat qabul qilish.
   Kategoriya yo'q: foydalanuvchi nimani xohlasa, shuni yozadi.
   Har bir murojaat raqam oladi va admin panelga tushadi.
   ===================================================================== */
const { Bot, GrammyError, HttpError, Keyboard, InlineKeyboard, InputFile } = require('grammy');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { config } = require('./config');
const db = require('./db');
const log = require('./logger');
const { escapeHtml, sanitizeText, cut, RateLimiter } = require('./security');

const bot = new Bot(config.botToken, {
  client: { apiRoot: config.botApiRoot },
});

/* Tez-tez xabar yuborayotgan foydalanuvchini bazaga yozmasdan to'xtatamiz
   (DDoS/flood himoyasi — bazaga yuklama tushmaydi) */
const floodLimiter = new RateLimiter({ windowMs: 10_000, max: 8, name: 'tg-flood' });

/* Matnsiz yuborilgan fayllar: 10 daqiqa "kutib turadi" va keyingi
   murojaatga qo'shiladi. Xotirada, cheklangan hajmda. */
const PENDING_TTL_MS = 10 * 60_000;
const pendingMedia = new Map();   // tg_id -> { items: [], expires: ms }

const BTN = {
  myAppeals: '📋 Mening murojaatlarim',
  help: 'ℹ️ Yordam',
  phone: '📞 Raqamni ulashish',
};

const STATUS_LABEL = {
  new: '🆕 Yangi',
  in_progress: "⏳ Ko'rib chiqilmoqda",
  answered: '✅ Javob berilgan',
  closed: '🔒 Yopilgan',
};

const mainKeyboard = () => new Keyboard()
  .text(BTN.myAppeals).text(BTN.help).row()
  .requestContact(BTN.phone)
  .resized().persistent();

const fullName = (user) => [user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'Noma\'lum';

const authorLine = (appeal) => {
  const parts = [escapeHtml(appeal.author_name || 'Noma\'lum')];
  if (appeal.author_username) parts.push('@' + escapeHtml(appeal.author_username));
  if (appeal.author_phone) parts.push(escapeHtml(appeal.author_phone));
  return parts.join(' · ');
};

/* =====================================================================
   XABAR MATNLARI
   ===================================================================== */
const welcomeText = (name) => `Assalomu alaykum, <b>${escapeHtml(name)}</b>!

Bu — <b>${escapeHtml(config.facultyName)}</b> ${escapeHtml(config.deanTitle)}i
<b>${escapeHtml(config.deanName)}</b> qabulxonasining rasmiy murojaat boti.

✍️ <b>Murojaatingizni shu yerga oddiy xabar qilib yozing.</b>
Mavzu yoki bo'lim tanlash shart emas — muammo, taklif, shikoyat yoki
savolingizni o'z so'zlaringiz bilan yozsangiz bo'ldi.

📎 Kerak bo'lsa rasm, hujjat yoki ovozli xabar ham yuborishingiz mumkin.
📞 Qayta aloqa uchun telefon raqamingizni ulashishingiz foydali (ixtiyoriy).

Har bir murojaat alohida raqam oladi, dekanat tomonidan ko'rib chiqiladi va
javob shu bot orqali sizga yetib boradi.

<i>Qabul vaqti: ${escapeHtml(config.officeHours)}</i>`;

const helpText = () => `<b>Qanday ishlaydi?</b>

1️⃣ Murojaatingizni shu chatga yozasiz (kamida ${config.appealMinLength} belgi).
2️⃣ Bot sizga murojaat raqamini beradi, masalan <code>MR-${new Date().getFullYear()}-0007</code>.
3️⃣ Dekanat ko'rib chiqadi va javobni shu bot orqali yuboradi.

<b>Buyruqlar</b>
/start — boshlash
/murojaatlarim — o'z murojaatlarim va ularning holati
/holat MR-${new Date().getFullYear()}-0007 — bitta murojaat holati
/yordam — shu yordam

<b>Cheklovlar</b>
• Bitta murojaat: ${config.appealMinLength}–${config.appealMaxLength} belgi
• Soatda ${config.appealsPerHour} ta, kunda ${config.appealsPerDay} ta murojaat
• Fayl: bitta murojaatga ${config.maxAttachmentsPerAppeal} tagacha, ${config.maxAttachmentMb} MB gacha

<b>Maxfiylik</b>
Siz yozgan matn, ismingiz, Telegram username va (ulashsangiz) telefon
raqamingiz faqat dekanat xodimlari ko'radigan himoyalangan panelda saqlanadi.
Uchinchi shaxslarga berilmaydi.`;

const confirmText = (appeal, attachmentsCount) => `✅ <b>Murojaatingiz qabul qilindi.</b>

🔖 Raqam: <code>${appeal.code}</code>
🕒 Vaqt: ${new Date(appeal.created_at).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' })}
${attachmentsCount ? `📎 Ilova: ${attachmentsCount} ta fayl\n` : ''}
Dekanat ko'rib chiqqach, javob shu chatga keladi.
Holatni bilish uchun: <code>/holat ${appeal.code}</code>`;

/* =====================================================================
   MIDDLEWARE: flood himoyasi, foydalanuvchini yozib qo'yish, blok
   ===================================================================== */
/* Flood ogohlantirishi har bir foydalanuvchiga oynada bir marta */
const floodNotified = new Map();   // tg_id -> vaqt

bot.use(async (ctx, next) => {
  const from = ctx.from;
  if (!from || from.is_bot) return;

  /* Guruh/kanal: murojaat faqat shaxsiy chatdan qabul qilinadi.
     Xabarnoma keladigan chat (guruh YOKI dekanning shaxsiy chati) — "xizmat chati". */
  const isPrivate = ctx.chat?.type === 'private';
  const isOfficeChat = !!ctx.chat && config.notifyChatIds.includes(ctx.chat.id);
  if (!isPrivate && !isOfficeChat) {
    /* Begona guruhdagi tugma bosilsa — Telegram'da "yuklanmoqda" bo'lib qolmasin */
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: 'Ruxsat yo\'q', show_alert: true }).catch(() => {});
    return;
  }
  ctx.state = { isOfficeChat };

  /* Albom (media-guruh) elementlari ketma-ket keladi — ularni flood deb hisoblamaymiz,
     aks holda rasmlarning bir qismi jimgina yo'qoladi (bot-05). */
  const isAlbumPart = !!ctx.message?.media_group_id;
  if (!isAlbumPart && !floodLimiter.check('tg:' + from.id).allowed) {
    log.warn('flood: xabar e\'tiborsiz qoldirildi', { tg_id: from.id });
    const lastNotice = floodNotified.get(from.id) || 0;
    if (isPrivate && Date.now() - lastNotice > 60_000) {
      floodNotified.set(from.id, Date.now());
      if (floodNotified.size > 5000) floodNotified.clear();
      await ctx.reply('⏱ Juda tez yuborilmoqda. Bir ozdan keyin qayta urinib ko\'ring — ' +
        'yuborilgan xabarlarning bir qismi qabul qilinmadi.').catch(() => {});
    }
    return;
  }

  if (isPrivate) {
    const user = db.upsertUser(from);
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
   BUYRUQLAR
   ===================================================================== */
async function sendWelcome(ctx) {
  if (ctx.chat.type !== 'private') return;
  await ctx.reply(welcomeText(fullName(ctx.from)), { parse_mode: 'HTML', reply_markup: mainKeyboard() });
}

async function sendHelp(ctx) {
  if (ctx.chat.type !== 'private') return;
  await ctx.reply(helpText(), { parse_mode: 'HTML', reply_markup: mainKeyboard() });
}

async function sendStatus(ctx, argument) {
  if (ctx.chat.type !== 'private') return;
  const code = sanitizeText(argument, 32);
  if (!code) {
    await ctx.reply(`Murojaat raqamini ham yozing. Masalan:\n<code>/holat MR-${new Date().getFullYear()}-0007</code>`, { parse_mode: 'HTML' });
    return;
  }
  const appeal = db.getAppealByCode(code);
  /* Faqat o'z murojaatini ko'rish mumkin (boshqa birov raqamini topib ham ko'ra olmaydi) */
  if (!appeal || appeal.tg_id !== ctx.from.id || appeal.deleted_at) {
    await ctx.reply('🔍 Bunday raqamli murojaatingiz topilmadi. Raqamni tekshirib qayta yuboring.');
    return;
  }
  await ctx.reply(appealCardText(appeal), { parse_mode: 'HTML' });
}

/* Buyruqlar. Telegram buyruqni "entity" bilan yuboradi; agar biror mijoz
   entity'siz yuborsa, pastdagi matn ishlovchisi zaxira sifatida ishlaydi. */
bot.command('start', sendWelcome);
bot.command(['yordam', 'help'], sendHelp);
bot.command(['murojaatlarim', 'my'], sendMyAppeals);
bot.command(['holat', 'status'], (ctx) => sendStatus(ctx, ctx.match));

/** "/holat MR-..." kabi matndan buyruq va argumentni ajratib olish */
function parseCommand(text) {
  const match = /^\/([A-Za-z0-9_]{1,32})(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/.exec(text.trim());
  return match ? { name: match[1].toLowerCase(), argument: match[2] || '' } : null;
}

function appealCardText(appeal) {
  const replies = db.listReplies(appeal.id).filter((r) => r.delivered);
  const head = `🔖 <code>${appeal.code}</code>\n` +
    `Holati: <b>${STATUS_LABEL[appeal.status] || appeal.status}</b>\n` +
    `Yuborilgan: ${new Date(appeal.created_at).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' })}\n\n` +
    `<b>Matn:</b>\n${escapeHtml(cut(appeal.body, 900))}`;
  if (!replies.length) return head + '\n\n⏳ Javob hali kelmagan.';
  const last = replies[replies.length - 1];
  return head + `\n\n<b>Dekanat javobi</b> (${new Date(last.created_at).toLocaleDateString('uz-UZ')}):\n${escapeHtml(cut(last.body, 900))}`;
}

async function sendMyAppeals(ctx) {
  if (ctx.chat.type !== 'private') return;
  const rows = db.listUserAppeals(ctx.from.id, 10);
  if (!rows.length) {
    await ctx.reply('Sizda hali murojaat yo\'q. Murojaatingizni shu yerga yozib yuboravering.', { reply_markup: mainKeyboard() });
    return;
  }
  const lines = rows.map((a) => {
    const date = new Date(a.created_at).toLocaleDateString('uz-UZ', { timeZone: 'Asia/Tashkent' });
    return `<code>${a.code}</code> · ${date}\n${STATUS_LABEL[a.status] || a.status} — ${escapeHtml(cut(a.body, 70))}`;
  });
  await ctx.reply(`<b>Oxirgi murojaatlaringiz (${rows.length})</b>\n\n` + lines.join('\n\n') +
    `\n\nBatafsil: <code>/holat ${rows[0].code}</code>`, { parse_mode: 'HTML' });
}

/* =====================================================================
   TELEFON RAQAMI (ixtiyoriy)
   ===================================================================== */
bot.on('message:contact', async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  const contact = ctx.message.contact;
  /* Faqat o'z raqami. Telegram "Raqamni ulashish" tugmasi doim user_id beradi;
     telefon kitobidan yuborilgan begona kontaktda u yo'q — demak qabul qilmaymiz. */
  if (contact.user_id !== ctx.from.id) {
    await ctx.reply('Iltimos, pastdagi <b>«📞 Raqamni ulashish»</b> tugmasi orqali faqat ' +
      '<b>o\'z</b> raqamingizni yuboring. Boshqa odamning kontakti qabul qilinmaydi.',
      { parse_mode: 'HTML', reply_markup: mainKeyboard() });
    return;
  }
  const phone = sanitizeText(contact.phone_number, 24);
  db.setUserPhone(ctx.from.id, phone);
  const recent = db.getRecentAppealOfUser(ctx.from.id, Date.now() - 7 * 24 * 3600_000);
  if (recent) db.setAppealPhone(recent.id, phone);
  await ctx.reply('📞 Rahmat, raqamingiz saqlandi. Kerak bo\'lsa dekanat shu raqam orqali bog\'lanadi.', { reply_markup: mainKeyboard() });
});

/* =====================================================================
   ILOVALAR (rasm, hujjat, ovoz, video)
   ===================================================================== */
function extractAttachment(message) {
  if (message.photo?.length) {
    const best = message.photo[message.photo.length - 1];
    return { kind: 'photo', fileId: best.file_id, fileUniqueId: best.file_unique_id, fileSize: best.file_size, fileName: 'rasm.jpg', mimeType: 'image/jpeg' };
  }
  if (message.document) {
    const d = message.document;
    return { kind: 'document', fileId: d.file_id, fileUniqueId: d.file_unique_id, fileName: sanitizeText(d.file_name, 120) || 'hujjat', mimeType: d.mime_type, fileSize: d.file_size };
  }
  if (message.voice) {
    const v = message.voice;
    return { kind: 'voice', fileId: v.file_id, fileUniqueId: v.file_unique_id, fileName: 'ovozli-xabar.ogg', mimeType: v.mime_type || 'audio/ogg', fileSize: v.file_size };
  }
  if (message.audio) {
    const a = message.audio;
    return { kind: 'audio', fileId: a.file_id, fileUniqueId: a.file_unique_id, fileName: sanitizeText(a.file_name, 120) || 'audio', mimeType: a.mime_type, fileSize: a.file_size };
  }
  if (message.video) {
    const v = message.video;
    return { kind: 'video', fileId: v.file_id, fileUniqueId: v.file_unique_id, fileName: sanitizeText(v.file_name, 120) || 'video.mp4', mimeType: v.mime_type, fileSize: v.file_size };
  }
  if (message.video_note) {
    const v = message.video_note;
    return { kind: 'video_note', fileId: v.file_id, fileUniqueId: v.file_unique_id, fileName: 'video-xabar.mp4', mimeType: 'video/mp4', fileSize: v.file_size };
  }
  return null;
}

function rememberPending(tgId, attachments) {
  const cap = Math.max(1, config.maxAttachmentsPerAppeal);
  const entry = pendingMedia.get(tgId) || { items: [], expires: 0 };
  entry.items = entry.items.filter(Boolean).concat([].concat(attachments)).slice(-cap);
  entry.expires = Date.now() + PENDING_TTL_MS;
  pendingMedia.set(tgId, entry);
  if (pendingMedia.size > 5000) {           // xotira himoyasi
    for (const [key, value] of pendingMedia) if (value.expires < Date.now()) pendingMedia.delete(key);
  }
}

function takePending(tgId) {
  const entry = pendingMedia.get(tgId);
  pendingMedia.delete(tgId);
  if (!entry || entry.expires < Date.now()) return [];
  return entry.items;
}

/* ---------------------------------------------------------------------
   ALBOM (media-guruh) BUFERI
   Telegram albomning har bir rasmini ALOHIDA update qilib yuboradi va
   ularning tartibini kafolatlamaydi (izoh birinchi kelmasligi mumkin).
   Shuning uchun guruhni bir necha soniya kutib, BUTUN albomni bitta
   murojaat sifatida qayta ishlaymiz.
   --------------------------------------------------------------------- */
const ALBUM_WAIT_MS = 2500;
const albums = new Map();   // `${tgId}:${media_group_id}` -> { items, caption, chatId, messageId, timer }

function bufferAlbumItem(ctx, attachment) {
  const key = `${ctx.from.id}:${ctx.message.media_group_id}`;
  const cap = Math.max(1, config.maxAttachmentsPerAppeal);
  let album = albums.get(key);
  if (!album) {
    album = {
      items: [], caption: '', dropped: 0, createdAt: Date.now(),
      chatId: ctx.chat.id, tgId: ctx.from.id, messageId: ctx.message.message_id, timer: null,
    };
    albums.set(key, album);
    /* Xotira himoyasi: faqat MUDDATI O'TGAN (qotib qolgan) yozuvlar o'chiriladi.
       Hozir kelayotgan albom (key) hech qachon o'chirilmaydi. */
    if (albums.size > 1000) {
      const cutoff = Date.now() - 3 * ALBUM_WAIT_MS;
      for (const [otherKey, value] of albums) {
        if (otherKey !== key && value.createdAt < cutoff) {
          clearTimeout(value.timer);
          albums.delete(otherKey);
        }
      }
    }
  }
  if (album.items.length < cap) album.items.push(attachment); else album.dropped++;

  const caption = sanitizeText(ctx.message.caption, config.appealMaxLength);
  if (caption && !album.caption) {
    album.caption = caption;
    album.messageId = ctx.message.message_id;   // murojaat shu xabarga bog'lanadi
  }

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

  const extra = album.dropped
    ? `\n\n⚠️ Faqat dastlabki ${config.maxAttachmentsPerAppeal} ta fayl qabul qilindi.`
    : '';

  /* 1) Izoh bor — butun albom bitta yangi murojaat */
  if (album.caption.length >= config.appealMinLength) {
    await createAppealFromMessage(ctx, album.caption, { extraAttachments: album.items, messageId: album.messageId, extraNote: extra });
    return;
  }

  /* 2) Izohsiz albom — yaqinda yuborilgan murojaatga qo'shamiz */
  const recent = db.getRecentAppealOfUser(album.tgId, Date.now() - 30 * 60_000);
  if (recent) {
    const free = Math.max(0, config.maxAttachmentsPerAppeal - db.countAttachments(recent.id));
    const added = album.items.slice(0, free);
    for (const item of added) db.addAttachment(recent.id, item);
    if (added.length) db.touchAppeal(recent.id);
    await bot.api.sendMessage(album.chatId, added.length
      ? `📎 ${added.length} ta fayl <code>${recent.code}</code> murojaatingizga qo'shildi.${extra}`
      : `📎 Bu murojaatga ${config.maxAttachmentsPerAppeal} tadan ko'p fayl qo'shib bo'lmaydi.`,
      { parse_mode: 'HTML' }).catch(() => {});
    return;
  }

  /* 3) Murojaat yo'q — fayllarni saqlab turamiz va matn so'raymiz (bitta xabar) */
  rememberPending(album.tgId, album.items);
  await bot.api.sendMessage(album.chatId,
    `📎 ${album.items.length} ta fayl qabul qilindi. Endi murojaatingizni <b>matn bilan</b> yozib yuboring — ` +
    `fayllar shu murojaatga qo'shiladi.${extra}`, { parse_mode: 'HTML' }).catch(() => {});
}

bot.on(['message:photo', 'message:document', 'message:voice', 'message:audio', 'message:video', 'message:video_note'], async (ctx) => {
  if (ctx.state?.isOfficeChat && (ctx.message.reply_to_message || /^\/(javob|statistika|zaxira)\b/i.test(ctx.message.caption || ''))) {
    const result = await handleOfficeReply(ctx);
    if (result?.handled) return;
    if (ctx.chat.type !== 'private') return;
  }
  if (ctx.chat.type !== 'private') return;

  const attachment = extractAttachment(ctx.message);
  if (!attachment) return;

  if (attachment.fileSize && attachment.fileSize > config.maxAttachmentMb * 1024 * 1024) {
    await ctx.reply(`📎 Fayl juda katta (${config.maxAttachmentMb} MB gacha mumkin). Kichikroq fayl yuboring.`);
    return;
  }

  /* Albom bo'lsa — buferga qo'yamiz, hammasi kelgach bir marta ishlanadi */
  if (ctx.message.media_group_id) {
    bufferAlbumItem(ctx, attachment);
    return;
  }

  const caption = sanitizeText(ctx.message.caption, config.appealMaxLength);

  /* 1) Izoh (caption) yetarli bo'lsa — bu yangi murojaat */
  if (caption.length >= config.appealMinLength) {
    await createAppealFromMessage(ctx, caption, { extraAttachments: [attachment] });
    return;
  }

  /* 2) Yaqinda (30 daqiqa) murojaat yuborgan bo'lsa — shu murojaatga qo'shamiz */
  const recent = db.getRecentAppealOfUser(ctx.from.id, Date.now() - 30 * 60_000);
  if (recent) {
    if (db.countAttachments(recent.id) >= config.maxAttachmentsPerAppeal) {
      await ctx.reply(`📎 Bu murojaatga ${config.maxAttachmentsPerAppeal} tadan ko'p fayl qo'shib bo'lmaydi.`);
      return;
    }
    db.addAttachment(recent.id, attachment);
    db.touchAppeal(recent.id);
    await ctx.reply(`📎 Fayl <code>${recent.code}</code> murojaatingizga qo'shildi.`, { parse_mode: 'HTML' });
    return;
  }

  /* 3) Aks holda — faylni saqlab turamiz va matn so'raymiz */
  rememberPending(ctx.from.id, attachment);
  await ctx.reply('📎 Fayl qabul qilindi. Endi murojaatingizni <b>matn bilan</b> yozib yuboring — fayl shu murojaatga qo\'shiladi.', { parse_mode: 'HTML' });
});

/* =====================================================================
   ASOSIY OQIM: har qanday matn — murojaat (kategoriya yo'q)
   ===================================================================== */
bot.on('message:text', async (ctx) => {
  const raw = ctx.message.text || '';

  /* Xizmat chati (guruh YOKI dekanning shaxsiy chati): xabarnomaga "reply"
     va /javob, /statistika buyruqlari murojaat emas — dekanat amallari (bot-01). */
  if (ctx.state?.isOfficeChat && (ctx.message.reply_to_message || /^\/(javob|statistika|zaxira)\b/i.test(raw.trim()))) {
    const result = await handleOfficeReply(ctx);
    if (result?.handled) return;
    /* Dekanat amali emas ekan — shaxsiy chat bo'lsa, odatdagi murojaat oqimi davom etadi */
    if (ctx.chat.type !== 'private') return;
  }
  if (ctx.chat.type !== 'private') return;
  if (raw.startsWith('/')) {
    /* Buyruqlar bot.command() orqali ishlanadi; bu yerga faqat entity'siz
       yoki noma'lum buyruqlar tushadi. */
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

  const body = sanitizeText(raw, config.appealMaxLength + 1);

  if (body.length < config.appealMinLength) {
    await ctx.reply(`✍️ Murojaatingizni to'liqroq yozing — kamida ${config.appealMinLength} belgi.\n` +
      'Muammo yoki taklifingizni bir-ikki gap bilan tushuntirib bering.');
    return;
  }
  if (body.length > config.appealMaxLength) {
    await ctx.reply(`✍️ Matn juda uzun (${body.length} belgi). ${config.appealMaxLength} belgigacha qisqartiring yoki ` +
      'batafsil ma\'lumotni hujjat (fayl) qilib yuboring.');
    return;
  }

  await createAppealFromMessage(ctx, body);
});

/* --- Chegaralar: spamdan himoya (bazadagi haqiqiy hisob bo'yicha) --- */
function checkAppealLimits(tgId) {
  const nowMs = Date.now();
  const sinceLast = nowMs - db.lastAppealAt(tgId);
  if (sinceLast < config.appealCooldownSeconds * 1000) {
    const wait = Math.ceil((config.appealCooldownSeconds * 1000 - sinceLast) / 1000);
    return { ok: false, message: `⏱ Juda tez yubordingiz. ${wait} soniyadan so'ng qayta urinib ko'ring.` };
  }
  if (db.countAppealsSince(tgId, nowMs - 3600_000) >= config.appealsPerHour) {
    return { ok: false, message: `⏱ Soat ichida ${config.appealsPerHour} ta murojaat chegarasiga yetdingiz.\n` +
      'Yangi murojaat uchun bir ozdan keyin urinib ko\'ring. Qo\'shimcha ma\'lumotni fayl qilib yuborsangiz, oxirgi murojaatingizga qo\'shiladi.' };
  }
  if (db.countAppealsSince(tgId, nowMs - 24 * 3600_000) >= config.appealsPerDay) {
    return { ok: false, message: `⏱ Kun ichida ${config.appealsPerDay} ta murojaat chegarasiga yetdingiz. Ertaga davom etasiz.` };
  }
  return { ok: true };
}

async function createAppealFromMessage(ctx, body, { extraAttachments = [], messageId = null, extraNote = '' } = {}) {
  const chatId = ctx.chat.id;
  const say = (text, options = {}) => bot.api.sendMessage(chatId, text, options).catch(() => {});

  /* Chegarani AVVAL tekshiramiz: rad etilsa, fayllar xotirada qolib,
     keyingi aloqasiz murojaatga yopishib ketmasligi kerak (bot-03). */
  const limit = checkAppealLimits(ctx.from.id);
  if (!limit.ok) {
    await say(limit.message + (extraAttachments.length
      ? '\n\n📎 Yuborgan faylingiz saqlanmadi — keyingi murojaat bilan birga qayta yuboring.'
      : ''));
    return { ok: false };
  }

  const user = db.getUser(ctx.from.id);
  let appeal;
  try {
    appeal = db.createAppeal({
      tgId: ctx.from.id,
      authorName: fullName(ctx.from),
      authorUsername: ctx.from.username || null,
      authorPhone: user?.phone || null,
      body,
      chatId,
      messageId: messageId || ctx.message.message_id,
    });
  } catch (err) {
    log.error('murojaatni saqlashda xato', { error: String(err.message) });
    await say('⚠️ Texnik nosozlik sababli murojaat saqlanmadi. Iltimos, bir ozdan keyin qayta yuboring.');
    return { ok: false };
  }

  /* Telegram update'ni qayta yuborgan bo'lsa — ikkinchi marta javob bermaymiz (bot-06) */
  if (appeal.duplicate) {
    log.info('takroriy update e\'tiborsiz qoldirildi', { code: appeal.code });
    return { ok: true, duplicate: true, appeal };
  }

  /* Kutib turgan + shu xabardagi fayllarni bog'laymiz */
  const cap = Math.max(1, config.maxAttachmentsPerAppeal);
  const attachments = [...takePending(ctx.from.id), ...extraAttachments].slice(0, cap);
  for (const attachment of attachments) {
    try { db.addAttachment(appeal.id, attachment); } catch (err) { log.warn('ilovani saqlash xatosi', { error: String(err.message) }); }
  }

  const count = db.countAttachments(appeal.id);       // haqiqiy son (bot-09)
  await say(confirmText(appeal, count) + extraNote, { parse_mode: 'HTML', reply_markup: mainKeyboard() });
  notifyOffice(appeal, count).catch((err) => log.warn('xabarnoma yuborilmadi', { error: String(err.message) }));
  return { ok: true, appeal };
}

/* =====================================================================
   DEKANATGA XABARNOMA + Telegram'dan to'g'ridan-to'g'ri javob berish
   ===================================================================== */
async function notifyOffice(appeal, attachmentsCount = 0) {
  if (!config.notifyChatIds.length) return;
  const text = `🆕 <b>Yangi murojaat</b> <code>${appeal.code}</code>\n` +
    `👤 ${authorLine(appeal)}\n` +
    `🕒 ${new Date(appeal.created_at).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' })}` +
    (attachmentsCount ? `\n📎 ${attachmentsCount} ta fayl` : '') +
    `\n\n${escapeHtml(cut(appeal.body, 1200))}` +
    `\n\n<i>Javob berish uchun shu xabarga «reply» qilib yozing yoki:</i>\n` +
    `<code>/javob ${appeal.code} javob matni</code>`;

  const keyboard = new InlineKeyboard()
    .text("⏳ Ko'rib chiqilmoqda", `st:${appeal.id}:in_progress`)
    .text('🔒 Yopish', `st:${appeal.id}:closed`);
  if (config.panelUrl.startsWith('https://')) keyboard.row().url('🖥 Panelda ochish', `${config.panelUrl}/#appeal-${appeal.id}`);

  for (const chatId of config.notifyChatIds) {
    try {
      const sent = await bot.api.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: keyboard });
      db.addNotification(appeal.id, chatId, sent.message_id);
    } catch (err) {
      log.warn('dekanat chatiga xabar yuborilmadi', { chat_id: chatId, error: String(err.message) });
    }
  }
}

/**
 * Xizmat chati (dekanat/dekan): xabarnomaga "reply" qilib javob yozish,
 * yoki buyruqlar bilan ishlash. Faqat NOTIFY_CHAT_IDS dagi chatlar uchun.
 */
async function handleOfficeReply(ctx) {
  const chatId = ctx.chat?.id;
  if (!chatId || !config.notifyChatIds.includes(chatId)) return { handled: false };

  const text = ctx.message?.text || ctx.message?.caption || '';

  /* /javob MR-2026-0007 javob matni — "reply" qilmasdan ham javob berish */
  const direct = /^\/javob(?:@[A-Za-z0-9_]+)?\s+(MR-\d{4}-[A-Za-z0-9]+)\s+([\s\S]+)$/i.exec(text.trim());
  if (direct) {
    const appeal = db.getAppealByCode(direct[1]);
    if (!appeal || appeal.deleted_at) {
      await ctx.reply('Bunday raqamli murojaat topilmadi.');
      return { handled: true };
    }
    const body = sanitizeText(direct[2], 3500);
    const result = await deliverReply(appeal, body, { author: '@' + (ctx.from.username || fullName(ctx.from)), via: 'telegram' });
    await ctx.reply(result.ok
      ? `✅ Javob <code>${appeal.code}</code> muallifiga yuborildi.`
      : `⚠️ Yuborilmadi: ${escapeHtml(result.error || 'noma\'lum xato')}`, { parse_mode: 'HTML' });
    return { handled: true };
  }
  if (/^\/javob\b/i.test(text.trim())) {
    await ctx.reply(`Foydalanish: <code>/javob MR-${new Date().getFullYear()}-0007 javob matni</code>\n` +
      'Yoki murojaat xabarnomasiga «reply» qilib yozing.', { parse_mode: 'HTML' });
    return { handled: true };
  }

  /* /zaxira — bazaning nusxasini hoziroq yuborish */
  if (/^\/zaxira(?:@[A-Za-z0-9_]+)?\b/i.test(text.trim())) {
    await ctx.reply('💾 Zaxira tayyorlanmoqda…');
    const result = await sendBackupToTelegram({ force: true });
    if (!result.sent) await ctx.reply(`⚠️ Zaxira yuborilmadi: ${escapeHtml(result.error || result.reason)}`, { parse_mode: 'HTML' });
    return { handled: true };
  }

  /* /statistika — qisqa holat */
  if (/^\/statistika(?:@[A-Za-z0-9_]+)?\b/i.test(text.trim())) {
    const stats = db.stats(config.slaHours * 3600_000);
    await ctx.reply(`📊 <b>Murojaatlar holati</b>\n\n` +
      `🆕 Yangi: <b>${stats.new}</b>\n` +
      `⏳ Ko'rilmoqda: <b>${stats.inProgress}</b>\n` +
      `✅ Javob berilgan: <b>${stats.answered}</b>\n` +
      `🔒 Yopilgan: <b>${stats.closed}</b>\n` +
      `⚠️ Kechikkan (${config.slaHours} soatdan oshgan): <b>${stats.overdue}</b>\n\n` +
      `Oxirgi 24 soatda: ${stats.last24h} ta\nJami: ${stats.total} ta`, { parse_mode: 'HTML' });
    return { handled: true };
  }

  const replyTo = ctx.message?.reply_to_message;
  if (!replyTo) return { handled: false };

  /* Murojaat xabarnomasiga emas, boshqa xabarga reply qilingan bo'lsa —
     bu dekanat amali emas; xabar odatdagi oqimda davom etsin (jim yo'qolmasin). */
  const link = db.findNotification(chatId, replyTo.message_id);
  if (!link) return { handled: false };

  const appeal = db.getAppeal(link.appeal_id);
  if (!appeal || appeal.deleted_at) {
    await ctx.reply('Bu murojaat o\'chirilgan.');
    return { handled: true };
  }

  const body = sanitizeText(ctx.message.text || ctx.message.caption, 3500);
  if (body.length < 2) {
    await ctx.reply('Javob matnini yozib «reply» qiling.');
    return { handled: true };
  }

  const author = '@' + (ctx.from.username || fullName(ctx.from));
  const result = await deliverReply(appeal, body, { author, via: 'telegram' });
  await ctx.reply(result.ok
    ? `✅ Javob <code>${appeal.code}</code> muallifiga yuborildi.`
    : `⚠️ Yuborilmadi: ${escapeHtml(result.error || 'noma\'lum xato')}`, { parse_mode: 'HTML' });
  return { handled: true };
}

/* Inline tugmalar: holatni tez o'zgartirish (faqat xizmat chatidan) */
bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data || '';
  const chatId = ctx.chat?.id;
  if (!chatId || !config.notifyChatIds.includes(chatId)) {
    await ctx.answerCallbackQuery({ text: 'Ruxsat yo\'q', show_alert: true });
    return;
  }
  const match = /^st:(\d+):(new|in_progress|answered|closed)$/.exec(data);
  if (!match) { await ctx.answerCallbackQuery(); return; }

  const appeal = db.getAppeal(Number(match[1]));
  if (!appeal || appeal.deleted_at) {
    await ctx.answerCallbackQuery({ text: 'Murojaat topilmadi yoki o\'chirilgan', show_alert: true });
    return;
  }

  db.setAppealStatus(appeal.id, match[2]);
  db.audit('@' + (ctx.from.username || ctx.from.id), 'status', appeal.code, `telegram → ${match[2]}`);
  await ctx.answerCallbackQuery({ text: `${appeal.code}: ${STATUS_LABEL[match[2]]}` });
});

/* =====================================================================
   JAVOBNI FOYDALANUVCHIGA YETKAZISH (panel ham, Telegram ham shu funksiyani ishlatadi)
   ===================================================================== */
/**
 * Matnni Telegram xabariga sig'adigan bo'laklarga ajratadi.
 * HTML qochirish matnni uzaytiradi (" → &quot;), shuning uchun hajm
 * QOCHIRILGAN uzunlik bo'yicha hisoblanadi (fe-04).
 */
function splitForTelegram(body, budget) {
  const parts = [];
  let current = '';
  let currentLength = 0;
  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) parts.push(trimmed);
    current = '';
    currentLength = 0;
  };

  for (const token of String(body).split(/(\s+)/)) {
    if (!token) continue;
    const tokenLength = escapeHtml(token).length;

    /* Juda uzun "so'z" (masalan havola yoki tirnoqlar ketma-ketligi) —
       kod nuqtalari bo'yicha majburiy bo'lamiz (emoji buzilmaydi). */
    if (tokenLength > budget) {
      flush();
      for (const ch of Array.from(token)) {
        const chLength = escapeHtml(ch).length;
        if (currentLength + chLength > budget) flush();
        current += ch;
        currentLength += chLength;
      }
      continue;
    }

    if (currentLength + tokenLength > budget) flush();
    current += token;
    currentLength += tokenLength;
  }
  flush();
  return parts.length ? parts : [String(body)];
}

const sleep = (ms) => new Promise((resolve) => { const t = setTimeout(resolve, ms); t.unref?.(); });

/** 429 (Too Many Requests) kelsa, Telegram aytgan muddat kutilib qayta yuboriladi */
async function sendWithRetry(chatId, text, options, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await bot.api.sendMessage(chatId, text, options);
    } catch (err) {
      const retryAfter = err instanceof GrammyError ? err.parameters?.retry_after : null;
      if (!retryAfter || attempt >= attempts) throw err;
      log.warn('Telegram chegarasi — qayta urinamiz', { retry_after: retryAfter, attempt });
      await sleep((retryAfter + 1) * 1000);
    }
  }
}

async function deliverReply(appeal, body, { author, via = 'panel' } = {}) {
  const replyId = db.addReply(appeal.id, { author, body, via });
  const header = `📬 <b>Dekanat javobi</b>\n🔖 Murojaat: <code>${appeal.code}</code>\n\n`;
  const footer = `\n\n<i>${escapeHtml(config.facultyName)}</i>`;
  /* 4096 — Telegram chegarasi; sarlavha/imzo va zaxira uchun joy qoldiramiz */
  const budget = 4096 - header.length - footer.length - 64;
  const chunks = splitForTelegram(body, budget);

  let delivered = 0;
  try {
    for (let i = 0; i < chunks.length; i++) {
      const isFirst = i === 0;
      const isLast = i === chunks.length - 1;
      const text = (isFirst ? header : `📬 <b>Javob (davomi ${i + 1}/${chunks.length})</b>\n\n`) +
        escapeHtml(chunks[i]) + (isLast ? footer : '');
      /* Telegram bitta chatga taxminan 1 xabar/soniya ruxsat beradi */
      if (!isFirst) await sleep(1100);
      await sendWithRetry(appeal.chat_id, text, {
        parse_mode: 'HTML',
        reply_parameters: isFirst && appeal.message_id ? { message_id: appeal.message_id, allow_sending_without_reply: true } : undefined,
      });
      delivered++;
    }
    db.markReplyDelivered(replyId, true);
    if (appeal.status !== 'closed') db.setAppealStatus(appeal.id, 'answered');
    return { ok: true, replyId };
  } catch (err) {
    const reason = err instanceof GrammyError ? err.description : String(err.message);
    /* Qisman yetkazilgan bo'lsa — operator buni ko'rishi shart */
    const detail = delivered > 0 && chunks.length > 1
      ? `${delivered}/${chunks.length} bo'lak yetkazildi, keyingisi xato: ${reason}`
      : reason;
    db.markReplyDelivered(replyId, false, detail);
    log.warn('javob yetkazilmadi', { appeal: appeal.code, error: detail });
    return { ok: false, replyId, error: detail, deliveredParts: delivered, totalParts: chunks.length };
  }
}

/**
 * Murojaat "ko'rib chiqilmoqda"ga o'tganda muallifga bir marta xabar beramiz —
 * odam javobni kutayotganini bilsin. (NOTIFY_USER_ON_PROGRESS bilan o'chiriladi.)
 */
async function notifyAuthorInProgress(appeal) {
  if (!config.notifyUserOnProgress) return { ok: false, skipped: true };
  if (!appeal || appeal.progress_notified_at) return { ok: false, skipped: true };
  db.markProgressNotified(appeal.id);
  try {
    await bot.api.sendMessage(appeal.chat_id,
      `⏳ <b>Murojaatingiz ko'rib chiqilmoqda</b>\n🔖 <code>${appeal.code}</code>\n\n` +
      'Dekanat murojaatingizni qabul qilib, ish boshladi. Javob tayyor bo\'lishi bilan shu yerga yuboriladi.',
      { parse_mode: 'HTML' });
    return { ok: true };
  } catch (err) {
    log.warn('holat xabarnomasi yetkazilmadi', { appeal: appeal.code, error: String(err.message) });
    return { ok: false, error: String(err.message) };
  }
}

/**
 * Kunlik xulosa: javobsiz qolgan (kechikkan) murojaatlar ro'yxati dekanat chatiga.
 * index.js uni muntazam chaqiradi; kuniga bir marta yuboriladi.
 */
async function sendDailyDigest({ force = false } = {}) {
  if (!config.notifyChatIds.length) return { sent: false, reason: 'chat yo\'q' };

  /* Mahalliy vaqt (TZ_OFFSET_HOURS) bo'yicha sana va soat */
  const local = new Date(Date.now() + config.tzOffsetHours * 3600_000);
  const today = local.toISOString().slice(0, 10);
  const hour = local.getUTCHours();

  if (!force) {
    if (hour !== config.digestHour) return { sent: false, reason: 'vaqti emas' };
    if (db.getSetting('last_digest_date') === today) return { sent: false, reason: 'bugun yuborilgan' };
  }
  db.setSetting('last_digest_date', today);

  const stats = db.stats(config.slaHours * 3600_000);
  const overdue = db.listOverdueAppeals(config.slaHours * 3600_000, 10);

  const lines = overdue.map((appeal) => {
    const days = Math.floor((Date.now() - appeal.created_at) / 3600_000 / 24);
    const age = days >= 1 ? `${days} kun` : `${Math.floor((Date.now() - appeal.created_at) / 3600_000)} soat`;
    return `• <code>${appeal.code}</code> — ${age} (${escapeHtml(appeal.author_name || 'noma\'lum')})\n  ${escapeHtml(cut(appeal.body, 90))}`;
  });

  const text = `🗓 <b>Kunlik xulosa</b> — ${today}\n\n` +
    `🆕 Yangi: <b>${stats.new}</b>   ⏳ Ko'rilmoqda: <b>${stats.inProgress}</b>\n` +
    `✅ Javob berilgan: <b>${stats.answered}</b>   📨 Oxirgi 24 soat: <b>${stats.last24h}</b>\n\n` +
    (overdue.length
      ? `⚠️ <b>${stats.overdue} ta murojaat ${config.slaHours} soatdan beri javobsiz:</b>\n\n${lines.join('\n')}` +
        (stats.overdue > overdue.length ? `\n\n…va yana ${stats.overdue - overdue.length} ta.` : '')
      : '✅ Javobsiz qolgan murojaat yo\'q. Rahmat!');

  let sent = 0;
  for (const chatId of config.notifyChatIds) {
    try { await bot.api.sendMessage(chatId, text, { parse_mode: 'HTML' }); sent++; }
    catch (err) { log.warn('kunlik xulosa yuborilmadi', { chat_id: chatId, error: String(err.message) }); }
  }
  log.info(`kunlik xulosa yuborildi (${sent} chat, ${stats.overdue} kechikkan)`);
  return { sent: sent > 0, overdue: stats.overdue };
}

/* =====================================================================
   AVTOMATIK ZAXIRA — bazani Telegram'ga fayl qilib yuborish.

   Replit kabi platformalarda nashr qilingan ilovaning fayl tizimi
   SAQLANMAYDI (har "Publish"da tozalanadi). Telegram esa yuborilgan
   faylni cheksiz saqlaydi — shuning uchun zaxira dekanat chatiga
   hujjat sifatida yuboriladi. Tiklash:  npm run restore -- <fayl>
   ===================================================================== */
async function sendBackupToTelegram({ force = false } = {}) {
  if (!config.backupToTelegram && !force) return { sent: false, reason: 'o\'chirilgan' };

  const chatId = config.backupChatId || config.notifyChatIds[0];
  if (!chatId) return { sent: false, reason: 'chat ko\'rsatilmagan' };

  const last = Number(db.getSetting('last_backup_at', 0));
  if (!force && Date.now() - last < config.backupHours * 3600_000) {
    return { sent: false, reason: 'vaqti emas' };
  }

  const stamp = new Date(Date.now() + config.tzOffsetHours * 3600_000).toISOString().replace(/[:T]/g, '-').slice(0, 16);
  const tmpFile = path.join(os.tmpdir(), `murojaat-${stamp}.db`);

  try {
    await db.backupTo(tmpFile);
    const packed = zlib.gzipSync(fs.readFileSync(tmpFile), { level: 9 });
    const stats = db.stats(config.slaHours * 3600_000);
    const sizeMb = (packed.length / 1024 / 1024).toFixed(2);

    await bot.api.sendDocument(chatId, new InputFile(packed, `murojaat-${stamp}.db.gz`), {
      caption: `💾 <b>Zaxira nusxa</b> — ${stamp.replace(/-/g, ':').slice(0, 10)}\n` +
        `Murojaatlar: <b>${stats.total}</b> · Javob berilgan: ${stats.answered} · Hajm: ${sizeMb} MB\n\n` +
        `<i>Bu faylni o'chirmang. Tiklash kerak bo'lsa yuklab olib:</i>\n` +
        `<code>npm run restore -- murojaat-${stamp}.db.gz</code>`,
      parse_mode: 'HTML',
      disable_notification: true,
    });

    db.setSetting('last_backup_at', Date.now());
    log.info(`zaxira yuborildi (${stats.total} murojaat, ${sizeMb} MB)`);
    return { sent: true, appeals: stats.total, sizeMb };
  } catch (err) {
    const reason = err instanceof GrammyError ? err.description : String(err.message);
    log.error('zaxira yuborilmadi', { error: reason });
    return { sent: false, error: reason };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* yo'q bo'lsa — muhim emas */ }
  }
}

/** Fayl havolasini olish (admin panel yuklab olishi uchun; token serverda qoladi) */
async function getFilePath(fileId) {
  const file = await bot.api.getFile(fileId);
  return file.file_path;
}

/* =====================================================================
   XATOLARNI USHLASH — bot hech qachon "o'lib qolmaydi"
   ===================================================================== */
bot.catch((err) => {
  const ctx = err.ctx;
  const where = ctx?.update?.update_id ? `update ${ctx.update.update_id}` : 'bot';
  if (err.error instanceof GrammyError) log.error(`${where}: Telegram API xatosi`, { description: err.error.description });
  else if (err.error instanceof HttpError) log.error(`${where}: tarmoq xatosi`, { error: String(err.error) });
  else log.error(`${where}: kutilmagan xato`, { error: String(err.error?.stack || err.error) });
});

async function setMyCommands() {
  await bot.api.setMyCommands([
    { command: 'start', description: 'Boshlash' },
    { command: 'murojaatlarim', description: 'Mening murojaatlarim' },
    { command: 'holat', description: 'Murojaat holati (raqam bilan)' },
    { command: 'yordam', description: "Qo'llanma" },
  ]);
}

module.exports = {
  bot, deliverReply, notifyOffice, notifyAuthorInProgress, sendDailyDigest,
  sendBackupToTelegram, getFilePath, setMyCommands, STATUS_LABEL,
};
