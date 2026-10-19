'use strict';
/* =====================================================================
   TELEGRAM BOT — murojaat qabul qilish.
   Kategoriya yo'q: foydalanuvchi nimani xohlasa, shuni yozadi.
   Har bir murojaat raqam oladi va admin panelga tushadi.
   ===================================================================== */
const { Bot, GrammyError, HttpError, Keyboard, InlineKeyboard } = require('grammy');
const { config } = require('./config');
const db = require('./db');
const log = require('./logger');
const { escapeHtml, sanitizeText, RateLimiter } = require('./security');

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
bot.use(async (ctx, next) => {
  const from = ctx.from;
  if (!from || from.is_bot) return;

  /* Guruh/kanal: murojaat faqat shaxsiy chatdan qabul qilinadi.
     Dekan xabarnoma keladigan guruh esa "xizmat chati" sifatida ishlaydi. */
  const isPrivate = ctx.chat?.type === 'private';
  const isNotifyChat = ctx.chat && config.notifyChatIds.includes(ctx.chat.id);
  if (!isPrivate && !isNotifyChat) return;

  if (!floodLimiter.check('tg:' + from.id).allowed) {
    log.warn('flood: foydalanuvchi vaqtincha e\'tiborsiz qoldirildi', { tg_id: from.id });
    return;
  }

  if (isPrivate) {
    const user = db.upsertUser(from);
    if (user?.is_blocked) {
      await ctx.reply('⛔️ Kechirasiz, sizning murojaat yuborish imkoniyatingiz vaqtincha to\'xtatilgan.\n' +
        'Savol bo\'lsa dekanatga bevosita murojaat qiling.').catch(() => {});
      return;
    }
    ctx.state = { user };
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
    `<b>Matn:</b>\n${escapeHtml(appeal.body.slice(0, 900))}${appeal.body.length > 900 ? '…' : ''}`;
  if (!replies.length) return head + '\n\n⏳ Javob hali kelmagan.';
  const last = replies[replies.length - 1];
  return head + `\n\n<b>Dekanat javobi</b> (${new Date(last.created_at).toLocaleDateString('uz-UZ')}):\n${escapeHtml(last.body.slice(0, 900))}`;
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
    return `<code>${a.code}</code> · ${date}\n${STATUS_LABEL[a.status] || a.status} — ${escapeHtml(a.body.slice(0, 70))}${a.body.length > 70 ? '…' : ''}`;
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
  /* Faqat o'z raqamini ulashishi mumkin — boshqaning kontaktini qabul qilmaymiz */
  if (contact.user_id && contact.user_id !== ctx.from.id) {
    await ctx.reply('Iltimos, faqat <b>o\'z</b> raqamingizni ulashing.', { parse_mode: 'HTML' });
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

function rememberPending(tgId, attachment) {
  const entry = pendingMedia.get(tgId) || { items: [], expires: 0 };
  entry.items = entry.items.filter(Boolean).slice(-config.maxAttachmentsPerAppeal + 1);
  entry.items.push(attachment);
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

bot.on(['message:photo', 'message:document', 'message:voice', 'message:audio', 'message:video', 'message:video_note'], async (ctx) => {
  if (ctx.chat.type !== 'private') return handleOfficeReply(ctx);

  const attachment = extractAttachment(ctx.message);
  if (!attachment) return;

  if (attachment.fileSize && attachment.fileSize > config.maxAttachmentMb * 1024 * 1024) {
    await ctx.reply(`📎 Fayl juda katta (${config.maxAttachmentMb} MB gacha mumkin). Kichikroq fayl yuboring.`);
    return;
  }

  const caption = sanitizeText(ctx.message.caption, config.appealMaxLength);

  /* 1) Izoh (caption) yetarli bo'lsa — bu yangi murojaat */
  if (caption.length >= config.appealMinLength) {
    rememberPending(ctx.from.id, attachment);
    await createAppealFromMessage(ctx, caption);
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
    /* Media-guruh (bir nechta rasm birga) bo'lsa — bitta javob yetarli */
    if (!ctx.message.media_group_id) {
      await ctx.reply(`📎 Fayl <code>${recent.code}</code> murojaatingizga qo'shildi.`, { parse_mode: 'HTML' });
    }
    return;
  }

  /* 3) Aks holda — faylni saqlab turamiz va matn so'raymiz */
  rememberPending(ctx.from.id, attachment);
  if (!ctx.message.media_group_id) {
    await ctx.reply('📎 Fayl qabul qilindi. Endi murojaatingizni <b>matn bilan</b> yozib yuboring — fayl shu murojaatga qo\'shiladi.', { parse_mode: 'HTML' });
  }
});

/* =====================================================================
   ASOSIY OQIM: har qanday matn — murojaat (kategoriya yo'q)
   ===================================================================== */
bot.on('message:text', async (ctx) => {
  if (ctx.chat.type !== 'private') return handleOfficeReply(ctx);

  const raw = ctx.message.text || '';
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

async function createAppealFromMessage(ctx, body) {
  const limit = checkAppealLimits(ctx.from.id);
  if (!limit.ok) {
    await ctx.reply(limit.message);
    return;
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
      chatId: ctx.chat.id,
      messageId: ctx.message.message_id,
    });
  } catch (err) {
    log.error('murojaatni saqlashda xato', { error: String(err.message) });
    await ctx.reply('⚠️ Texnik nosozlik sababli murojaat saqlanmadi. Iltimos, bir ozdan keyin qayta yuboring.');
    return;
  }

  /* Kutib turgan fayllarni shu murojaatga bog'laymiz */
  const pending = takePending(ctx.from.id).slice(0, config.maxAttachmentsPerAppeal);
  for (const attachment of pending) {
    try { db.addAttachment(appeal.id, attachment); } catch (err) { log.warn('ilovani saqlash xatosi', { error: String(err.message) }); }
  }

  await ctx.reply(confirmText(appeal, pending.length), { parse_mode: 'HTML', reply_markup: mainKeyboard() });
  notifyOffice(appeal, pending.length).catch((err) => log.warn('xabarnoma yuborilmadi', { error: String(err.message) }));
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
    `\n\n${escapeHtml(appeal.body.slice(0, 1200))}${appeal.body.length > 1200 ? '…' : ''}` +
    `\n\n<i>Javob berish uchun shu xabarga «reply» qilib yozing.</i>`;

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

/** Xizmat chatida xabarnomaga "reply" qilingan bo'lsa — bu murojaatga javob. */
async function handleOfficeReply(ctx) {
  const chatId = ctx.chat?.id;
  if (!chatId || !config.notifyChatIds.includes(chatId)) return;
  const replyTo = ctx.message?.reply_to_message;
  if (!replyTo) return;

  const link = db.findNotification(chatId, replyTo.message_id);
  if (!link) return;

  const appeal = db.getAppeal(link.appeal_id);
  if (!appeal || appeal.deleted_at) {
    await ctx.reply('Bu murojaat o\'chirilgan.');
    return;
  }

  const body = sanitizeText(ctx.message.text || ctx.message.caption, 3500);
  if (body.length < 2) {
    await ctx.reply('Javob matnini yozib «reply» qiling.');
    return;
  }

  const author = '@' + (ctx.from.username || fullName(ctx.from));
  const result = await deliverReply(appeal, body, { author, via: 'telegram' });
  await ctx.reply(result.ok
    ? `✅ Javob <code>${appeal.code}</code> muallifiga yuborildi.`
    : `⚠️ Yuborilmadi: ${escapeHtml(result.error || 'noma\'lum xato')}`, { parse_mode: 'HTML' });
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
  if (!appeal) { await ctx.answerCallbackQuery({ text: 'Murojaat topilmadi', show_alert: true }); return; }

  db.setAppealStatus(appeal.id, match[2]);
  db.audit('@' + (ctx.from.username || ctx.from.id), 'status', appeal.code, `telegram → ${match[2]}`);
  await ctx.answerCallbackQuery({ text: `${appeal.code}: ${STATUS_LABEL[match[2]]}` });
});

/* =====================================================================
   JAVOBNI FOYDALANUVCHIGA YETKAZISH (panel ham, Telegram ham shu funksiyani ishlatadi)
   ===================================================================== */
async function deliverReply(appeal, body, { author, via = 'panel' } = {}) {
  const replyId = db.addReply(appeal.id, { author, body, via });
  const text = `📬 <b>Dekanat javobi</b>\n🔖 Murojaat: <code>${appeal.code}</code>\n\n${escapeHtml(body)}\n\n` +
    `<i>${escapeHtml(config.facultyName)}</i>`;
  try {
    await bot.api.sendMessage(appeal.chat_id, text, {
      parse_mode: 'HTML',
      reply_parameters: appeal.message_id ? { message_id: appeal.message_id, allow_sending_without_reply: true } : undefined,
    });
    db.markReplyDelivered(replyId, true);
    if (appeal.status !== 'closed') db.setAppealStatus(appeal.id, 'answered');
    return { ok: true, replyId };
  } catch (err) {
    const reason = err instanceof GrammyError ? err.description : String(err.message);
    db.markReplyDelivered(replyId, false, reason);
    log.warn('javob yetkazilmadi', { appeal: appeal.code, error: reason });
    return { ok: false, replyId, error: reason };
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

module.exports = { bot, deliverReply, notifyOffice, getFilePath, setMyCommands, STATUS_LABEL };
