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

/* Matnsiz yuborilgan fayllar 10 daqiqa kutadi va keyingi murojaatga qo'shiladi */
const PENDING_TTL_MS = 10 * 60_000;
const pendingMedia = new Map();

/* Albom (media-guruh) buferi — Telegram rasmlarni alohida yuboradi */
const ALBUM_WAIT_MS = 2500;
const albums = new Map();

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

Xabar tagidagi tugmalar: holatni o'zgartirish va bloklash.

<b>Buyruqlar</b>
/statistika — umumiy holat
/kechikkanlar — ${config.slaHours} soatdan beri javobsiz murojaatlar
/javob &lt;raqam&gt; &lt;matn&gt; — raqam bo'yicha javob berish
/bloklash &lt;raqam yoki ID&gt; [sabab] — foydalanuvchini bloklash
/blokdan &lt;raqam yoki ID&gt; — blokni olib tashlash
/bloklanganlar — bloklanganlar ro'yxati
/zaxira — bazaning nusxasini shu chatga yuborish
/yordam — shu qo'llanma`;

const confirmText = (appeal, attachments) => `✅ <b>Murojaatingiz qabul qilindi.</b>

🔖 Raqam: <code>${appeal.code}</code>
🕒 ${localTime(appeal.created_at)}
${attachments ? `📎 Ilova: ${attachments} ta fayl\n` : ''}
Dekanat ko'rib chiqqach, javob shu chatga keladi.
Holatni bilish: <code>/holat ${appeal.code}</code>`;

/* Admin chatiga yuboriladigan murojaat kartasi */
function appealCard(appeal, attachmentsCount = 0) {
  const author = [
    escapeHtml(appeal.author_name || 'Noma\'lum'),
    appeal.author_username ? '@' + escapeHtml(appeal.author_username) : null,
    appeal.author_phone ? escapeHtml(appeal.author_phone) : null,
  ].filter(Boolean).join(' · ');

  const statusLine = appeal.status === 'new'
    ? ''
    : `\n━━━━━━━━━━━━━━━━━━━━\nHolat: <b>${STATUS_LABEL[appeal.status]}</b>`;

  return `${appeal.status === 'new' ? '🆕' : STATUS_LABEL[appeal.status].slice(0, 2)} <b>Murojaat</b> <code>${appeal.code}</code>\n` +
    `👤 ${author}\n` +
    `🆔 <code>${appeal.tg_id}</code>\n` +
    `🕒 ${localTime(appeal.created_at)}` +
    (attachmentsCount ? `\n📎 ${attachmentsCount} ta fayl` : '') +
    `\n\n${escapeHtml(cut(appeal.body, 3000))}` +
    statusLine +
    `\n\n<i>Javob berish: shu xabarga «reply» qilib yozing</i>`;
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

  /* Flood: faqat oddiy foydalanuvchilarga; albom qismlari hisoblanmaydi */
  if (!adminChat && !ctx.message?.media_group_id && !floodLimiter.check('tg:' + from.id).allowed) {
    const last = floodNotified.get(from.id) || 0;
    if (Date.now() - last > 60_000) {
      floodNotified.set(from.id, Date.now());
      if (floodNotified.size > 5000) floodNotified.clear();
      await ctx.reply('⏱ Juda tez yuborilmoqda. Bir ozdan keyin qayta urinib ko\'ring.').catch(() => {});
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
    default: return bot.api.sendDocument(chatId, attachment.fileId, options);
  }
}

/** Murojaatni barcha admin chatlariga yuboradi va "reply" marshrutlarini yozib qo'yadi */
async function sendAppealToAdmins(appeal, attachments = []) {
  const user = store.getUser(appeal.tg_id);
  const card = appealCard(appeal, attachments.length);
  const buttons = appealButtons(appeal, !!user?.is_blocked);
  let delivered = 0;

  for (const chatId of config.adminChatIds) {
    try {
      const header = await bot.api.sendMessage(chatId, card, { parse_mode: 'HTML', reply_markup: buttons });
      store.addRoute(chatId, header.message_id, appeal.id, 1);
      delivered++;

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
  const card = appealCard(appeal, count);
  const buttons = appealButtons(appeal, !!user?.is_blocked);
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
  if (recent) store.setAppealPhone(recent.id, phone);
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
  return null;
}

function rememberPending(tgId, attachments) {
  const cap = Math.max(1, config.maxAttachmentsPerAppeal);
  const entry = pendingMedia.get(tgId) || { items: [], expires: 0 };
  entry.items = entry.items.filter(Boolean).concat([].concat(attachments)).slice(-cap);
  entry.expires = Date.now() + PENDING_TTL_MS;
  pendingMedia.set(tgId, entry);
  if (pendingMedia.size > 5000) {
    for (const [key, value] of pendingMedia) if (value.expires < Date.now()) pendingMedia.delete(key);
  }
}

function takePending(tgId) {
  const entry = pendingMedia.get(tgId);
  pendingMedia.delete(tgId);
  if (!entry || entry.expires < Date.now()) return [];
  return entry.items;
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
    const added = album.items.slice(0, free);
    for (const item of added) store.addAttachment(recent.id, item);
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
    await refreshAppealCards(appeal);
  }
}

bot.on(['message:photo', 'message:document', 'message:voice', 'message:audio', 'message:video', 'message:video_note'], async (ctx) => {
  if (ctx.state?.adminChat) return handleAdminMessage(ctx);
  if (!ctx.state?.isPrivate) return;

  const attachment = extractAttachment(ctx.message);
  if (!attachment) return;

  if (attachment.fileSize && attachment.fileSize > config.maxAttachmentMb * 1024 * 1024) {
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
    store.addAttachment(recent.id, attachment);
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

  const body = sanitizeText(raw, config.appealMaxLength + 1);
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
    });
  } catch (err) {
    log.error('murojaatni saqlashda xato', { error: String(err.message) });
    await say('⚠️ Texnik nosozlik sababli murojaat saqlanmadi. Iltimos, bir ozdan keyin qayta yuboring.');
    return { ok: false };
  }

  if (appeal.duplicate) { log.info('takroriy update e\'tiborsiz qoldirildi', { code: appeal.code }); return { ok: true, duplicate: true }; }

  const all = [...takePending(ctx.from.id), ...attachments].slice(0, Math.max(1, config.maxAttachmentsPerAppeal));
  for (const attachment of all) {
    try { store.addAttachment(appeal.id, attachment); } catch (err) { log.warn('ilovani saqlash xatosi', { error: String(err.message) }); }
  }

  const delivered = await sendAppealToAdmins(appeal, all);
  await say(confirmText(appeal, all.length) + note +
    (delivered ? '' : '\n\n⚠️ Texnik sabab bilan dekanatga yetkazishda kechikish bo\'lishi mumkin.'),
    { parse_mode: 'HTML', reply_markup: mainKeyboard() });
  return { ok: true, appeal };
}

/* =====================================================================
   ADMIN: javob, buyruqlar, tugmalar
   ===================================================================== */
async function deliverReply(appeal, body, { author }) {
  const replyId = store.addReply(appeal.id, { author, body });
  const header = `📬 <b>Dekanat javobi</b>\n🔖 Murojaat: <code>${appeal.code}</code>\n\n`;
  const footer = `\n\n<i>${escapeHtml(config.facultyName)}</i>`;
  const budget = 4096 - header.length - footer.length - 64;
  const chunks = splitForTelegram(body, budget);
  let delivered = 0;

  try {
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
    store.markReplyDelivered(replyId, true);
    if (appeal.status !== 'closed') {
      const updated = store.setAppealStatus(appeal.id, 'answered');
      await refreshAppealCards(updated);
    }
    return { ok: true };
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
async function handleAdminMessage(ctx) {
  const text = ctx.message?.text || ctx.message?.caption || '';
  const command = text.startsWith('/') ? parseCommand(text) : null;

  if (command) {
    if (!ctx.state.admin) {
      await ctx.reply('⛔️ Sizda dekanat buyruqlaridan foydalanish huquqi yo\'q.');
      return;
    }
    switch (command.name) {
      case 'javob': return adminReplyByCode(ctx, command.argument);
      case 'statistika': return adminStats(ctx);
      case 'kechikkanlar': return adminOverdue(ctx);
      case 'bloklash': return adminBlock(ctx, command.argument, true);
      case 'blokdan': return adminBlock(ctx, command.argument, false);
      case 'bloklanganlar': return adminBlockedList(ctx);
      case 'zaxira': {
        await ctx.reply('💾 Zaxira tayyorlanmoqda…');
        const result = await sendBackupToTelegram({ force: true, chatId: ctx.chat.id });
        if (!result.sent) await ctx.reply(`⚠️ Yuborilmadi: ${escapeHtml(result.error || result.reason)}`, { parse_mode: 'HTML' });
        return;
      }
      case 'start': case 'yordam': case 'help': return sendHelp(ctx);
      default:
        await ctx.reply('Bunday buyruq yo\'q. /yordam — dekanat qo\'llanmasi.');
        return;
    }
  }

  /* "Reply" — murojaatga javob */
  const replyTo = ctx.message?.reply_to_message;
  if (replyTo) {
    const route = store.findRoute(ctx.chat.id, replyTo.message_id);
    if (route) {
      if (!ctx.state.admin) { await ctx.reply('⛔️ Sizda javob berish huquqi yo\'q.'); return; }
      const appeal = store.getAppeal(route.appeal_id);
      if (!appeal) { await ctx.reply('Murojaat topilmadi.'); return; }
      const body = sanitizeText(text, 3500);
      if (body.length < 2) { await ctx.reply('Javob matnini yozing.'); return; }
      const result = await deliverReply(appeal, body, { author: '@' + (ctx.from.username || fullName(ctx.from)) });
      await ctx.reply(result.ok
        ? `✅ Javob <code>${appeal.code}</code> muallifiga yuborildi.`
        : `⚠️ Yuborilmadi: ${escapeHtml(result.error || '')}`, { parse_mode: 'HTML' });
      return;
    }
  }

  /* Boshqa xabarlar — qisqa eslatma (admin chati murojaat qabul qilmaydi) */
  await ctx.reply('ℹ️ Bu — dekanat chati. Javob berish uchun murojaat xabariga «reply» qiling ' +
    'yoki <code>/javob MR-… matn</code> yozing. /yordam', { parse_mode: 'HTML' });
}

async function adminReplyByCode(ctx, argument) {
  const match = /^(MR-\d{4}-[A-Za-z0-9]+)\s+([\s\S]+)$/i.exec(String(argument).trim());
  if (!match) {
    await ctx.reply(`Foydalanish: <code>/javob MR-${new Date().getFullYear()}-0007 javob matni</code>`, { parse_mode: 'HTML' });
    return;
  }
  const appeal = store.getAppealByCode(match[1]);
  if (!appeal) { await ctx.reply('Bunday raqamli murojaat topilmadi.'); return; }
  const result = await deliverReply(appeal, sanitizeText(match[2], 3500), { author: '@' + (ctx.from.username || fullName(ctx.from)) });
  await ctx.reply(result.ok
    ? `✅ Javob <code>${appeal.code}</code> muallifiga yuborildi.`
    : `⚠️ Yuborilmadi: ${escapeHtml(result.error || '')}`, { parse_mode: 'HTML' });
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
  if (!rows.length) { await ctx.reply(`✅ ${config.slaHours} soatdan beri javobsiz murojaat yo'q.`); return; }
  const lines = rows.map((a) => {
    const hours = Math.floor((Date.now() - a.created_at) / 3600_000);
    const age = hours >= 24 ? `${Math.floor(hours / 24)} kun` : `${hours} soat`;
    return `• <code>${a.code}</code> — ${age} (${escapeHtml(a.author_name || '')})\n  ${escapeHtml(cut(a.body, 80))}`;
  });
  await ctx.reply(`⚠️ <b>Javobsiz murojaatlar (${rows.length})</b>\n\n${lines.join('\n\n')}`, { parse_mode: 'HTML' });
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

  const text = `🗓 <b>Kunlik xulosa</b> — ${today}\n\n` +
    `🆕 Yangi: <b>${s.new}</b>   ⏳ Ko'rilmoqda: <b>${s.inProgress}</b>\n` +
    `✅ Javob berilgan: <b>${s.answered}</b>   📨 Oxirgi 24 soat: <b>${s.last24h}</b>\n\n` +
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
  const target = chatId || config.backupChatId || config.adminChatIds[0];
  if (!target) return { sent: false, reason: 'chat ko\'rsatilmagan' };

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
  if (err.error instanceof GrammyError) log.error(`${where}: Telegram API xatosi`, { description: err.error.description });
  else if (err.error instanceof HttpError) log.error(`${where}: tarmoq xatosi`, { error: String(err.error) });
  else log.error(`${where}: kutilmagan xato`, { error: String(err.error?.stack || err.error) });
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
  sendAppealToAdmins, deliverReply, refreshAppealCards,
  notifyAuthorInProgress, sendDailyDigest, sendBackupToTelegram,
  STATUS_LABEL,
};
