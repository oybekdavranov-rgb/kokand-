'use strict';
/* =====================================================================
   DEKANAT PANELI — Telegram ichida

   Web-panel yo'q: hamma boshqaruv bot ichida, tugmalar orqali.
     /panel  → bosh menyu (statistika, murojaatlar, adminlar, zaxira)

   Huquqlar ikki darajali:
     owner (egasi) — hammasi, shu jumladan adminlarni ID orqali qo'shish,
                     zaxira va jurnal. Sozlamadagi ADMIN_USER_IDS — doimiy
                     egalar, ularni paneldan olib tashlab bo'lmaydi.
     admin         — murojaatlar bilan ishlaydi (javob, holat, bloklash).

   Har bir tugma bosilganda huquq QAYTA tekshiriladi: tugmalar eski
   xabarda qolib ketsa ham, huquqi olingan odam amal bajara olmaydi.
   ===================================================================== */
const { InlineKeyboard } = require('grammy');

const { config } = require('./config');
const store = require('./store');
const log = require('./logger');
const { escapeHtml, sanitizeText, cut } = require('./security');

const PAGE_SIZE = 5;
const PROMPT_TTL_MS = 15 * 60_000;

/* Buyruq matnidagi belgilar — bot qayta ishga tushsa ham javobni tanib oladi */
const MARK = {
  addAdmin: '#admin-qoshish',
  search: '#qidirish',
};

/* bot.js dan keladigan yordamchilar (aylanma require bo'lmasligi uchun) */
let deps = null;
const init = (dependencies) => { deps = dependencies; };

/* Kutilayotgan «reply» so'rovlari: chat:xabar → amal */
const prompts = new Map();
function rememberPrompt(chatId, messageId, action, actorId) {
  prompts.set(`${chatId}:${messageId}`, { action, actorId, at: Date.now() });
  if (prompts.size > 500) {
    for (const [key, value] of prompts) if (Date.now() - value.at > PROMPT_TTL_MS) prompts.delete(key);
  }
}
function takePrompt(chatId, messageId, text) {
  const key = `${chatId}:${messageId}`;
  const entry = prompts.get(key);
  if (entry) {
    prompts.delete(key);
    if (Date.now() - entry.at < PROMPT_TTL_MS) return entry.action;
  }
  /* Bot qayta ishga tushgan bo'lsa — so'rov matnidagi belgi bo'yicha aniqlaymiz */
  if (text.includes(MARK.addAdmin)) return 'add-admin';
  if (text.includes(MARK.search)) return 'search';
  return null;
}

/* =====================================================================
   HUQUQLAR
   ===================================================================== */
/* Sozlamadagi doimiy egalar: ADMIN_USER_IDS, u bo'sh bo'lsa — ADMIN_CHAT_IDS
   dagi SHAXSIY chatlar (shaxsiy chat ID'si odam ID'siga teng). Bularni
   paneldan o'chirib bo'lmaydi: ular .env da yozilgan. */
const FIXED_OWNERS = config.adminUserIds.length
  ? [...config.adminUserIds]
  : config.adminChatIds.filter((id) => id > 0);

const envOwner = (userId) => FIXED_OWNERS.includes(userId);
const isAdmin = (userId) => envOwner(userId) || !!store.getAdmin(userId);
const isOwner = (userId) => envOwner(userId) || store.getAdmin(userId)?.role === 'owner';
const roleLabel = (userId) => (isOwner(userId) ? '👑 egasi' : '👤 admin');

/** Sozlamadagi ADMIN_USER_IDS bazada ham egasi bo'lib turadi */
function bootstrap() {
  const notifyByDefault = config.adminChatIds.length ? 0 : 1;
  for (const id of FIXED_OWNERS) {
    const existing = store.getAdmin(id);
    if (!existing) {
      store.addAdmin(id, { role: 'owner', notify: notifyByDefault, note: 'sozlamadan (.env)' });
      store.logAdminAction(id, 'sozlamadan_egasi', id, '.env');
    } else if (existing.role !== 'owner') {
      store.setAdminRole(id, 'owner');
    }
  }

  /* .env dan olib tashlangan egasi bazada qolib ketmasin: sozlama — hokim.
     Panel orqali qo'shilgan adminlar esa joyida qoladi. */
  for (const admin of store.listAdmins(200)) {
    if (envOwner(admin.tg_id)) continue;
    if (!String(admin.note || '').startsWith('sozlamadan')) continue;
    store.removeAdmin(admin.tg_id);
    store.logAdminAction(admin.tg_id, 'sozlamadan_ochdi', admin.tg_id, '.env dan olib tashlangan');
    log.warn('sozlamadan olib tashlangan egasi paneldan ham o\'chirildi', { tg_id: admin.tg_id });
  }
  return store.listAdmins(200).length;
}

/* =====================================================================
   KO'RINISHLAR
   ===================================================================== */
const STATUS_FILTERS = [
  { key: 'new', label: '🆕 Yangi' },
  { key: 'in_progress', label: '⏳ Ko\'rilmoqda' },
  { key: 'answered', label: '✅ Javob berilgan' },
  { key: 'closed', label: '🔒 Yopilgan' },
];

function menuText(userId) {
  const s = store.stats(config.slaHours * 3600_000);
  const stuck = store.listUndelivered(Date.now() - 7 * 24 * 3600_000, 1).length;
  return `🏛 <b>Dekanat paneli</b>\n` +
    `<i>${escapeHtml(config.facultyName)}</i>\n\n` +
    `🆕 Yangi: <b>${s.new}</b>   ⏳ Ko'rilmoqda: <b>${s.inProgress}</b>\n` +
    `✅ Javob berilgan: <b>${s.answered}</b>   🔒 Yopilgan: <b>${s.closed}</b>\n` +
    `⚠️ Kechikkan (${config.slaHours} soat+): <b>${s.overdue}</b>   📨 24 soatda: <b>${s.last24h}</b>\n` +
    (stuck ? '\n🚨 <b>Yetib bormagan murojaatlar bor</b> — /navbat\n' : '') +
    `\nSiz: ${roleLabel(userId)}  ·  <code>${userId}</code>`;
}

function menuKeyboard(userId) {
  const s = store.stats(config.slaHours * 3600_000);
  const me = store.getAdmin(userId);
  const keyboard = new InlineKeyboard()
    .text(`🆕 Yangi (${s.new})`, 'p:l:new:0').text(`⏳ Ko'rilmoqda (${s.inProgress})`, 'p:l:in_progress:0').row()
    .text('📋 Hammasi', 'p:l:all:0').text(`⚠️ Kechikkanlar (${s.overdue})`, 'p:ov').row()
    .text('🔍 Qidirish', 'p:q').text('⛔️ Bloklanganlar', 'p:bl').row();

  if (me) keyboard.text(me.notify ? '🔔 Xabarnoma: yoniq' : '🔕 Xabarnoma: o\'chiq', 'p:nt').row();
  if (isOwner(userId)) keyboard.text('👥 Adminlar', 'p:ad').text('💾 Zaxira', 'p:bk').row().text('📜 Jurnal', 'p:log');
  return keyboard;
}

const shortAge = (ms) => {
  const hours = Math.floor((Date.now() - ms) / 3600_000);
  if (hours < 1) return `${Math.max(1, Math.floor((Date.now() - ms) / 60_000))} daq`;
  return hours < 24 ? `${hours} soat` : `${Math.floor(hours / 24)} kun`;
};

function listView(statusKey, page) {
  const status = statusKey === 'all' ? null : statusKey;
  const total = store.countAppeals(status);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(Math.max(0, page), pages - 1);
  const rows = store.listAppeals({ status, limit: PAGE_SIZE, offset: current * PAGE_SIZE });
  const title = statusKey === 'all'
    ? '📋 <b>Barcha murojaatlar</b>'
    : `${STATUS_FILTERS.find((f) => f.key === statusKey)?.label || statusKey} <b>murojaatlar</b>`;

  const lines = rows.map((a, i) => `${current * PAGE_SIZE + i + 1}. <code>${a.code}</code> · ${escapeHtml(cut(a.author_name || '', 24))} · ${shortAge(a.created_at)}\n` +
    `    ${escapeHtml(cut(a.body, 70))}`);

  const keyboard = new InlineKeyboard();
  for (const a of rows) keyboard.text(`${a.code} · ${cut(a.author_name || '—', 14)}`, `p:a:${a.id}`).row();
  if (pages > 1) {
    if (current > 0) keyboard.text('◀️', `p:l:${statusKey}:${current - 1}`);
    keyboard.text(`${current + 1}/${pages}`, 'p:nop');
    if (current < pages - 1) keyboard.text('▶️', `p:l:${statusKey}:${current + 1}`);
    keyboard.row();
  }
  keyboard.text('🏛 Panel', 'p:menu');

  return {
    text: `${title} — ${total} ta\n\n${rows.length ? lines.join('\n\n') : 'Bo\'sh.'}`,
    keyboard,
  };
}

function appealView(appealId) {
  const appeal = store.getAppeal(appealId);
  if (!appeal) return null;
  const user = store.getUser(appeal.tg_id);
  const blocked = !!user?.is_blocked;
  const count = store.countAttachments(appeal.id);
  const replies = store.listReplies(appeal.id);
  const built = deps.buildAppealCard(appeal, count, blocked);

  let text = built.card;
  if (replies.length) {
    const last = replies[replies.length - 1];
    text += `\n\n━━━━━━━━━━━━━━━━━━━━\n📬 <b>Oxirgi javob</b> (${escapeHtml(last.author || '')}, ` +
      `${deps.localTime(last.created_at)}) ${last.delivered ? '✅' : '⚠️'}\n${escapeHtml(cut(last.body, 400))}` +
      (replies.length > 1 ? `\n<i>Jami javob: ${replies.length} ta</i>` : '');
  }

  const keyboard = new InlineKeyboard().text('✍️ Javob yozish', `p:r:${appeal.id}`).row();
  if (appeal.status !== 'in_progress') keyboard.text('⏳ Ko\'rilmoqda', `p:s:${appeal.id}:in_progress`);
  if (appeal.status !== 'closed') keyboard.text('🔒 Yopish', `p:s:${appeal.id}:closed`);
  keyboard.row();
  if (count) keyboard.text(`📎 Fayllar (${count})`, `p:f:${appeal.id}`);
  keyboard.text(blocked ? '♻️ Blokdan chiqarish' : '⛔️ Bloklash', `p:b:${appeal.id}`).row();
  keyboard.text('🏛 Panel', 'p:menu');

  return { text: cut(text, 3900), keyboard, appeal };
}

function adminsView() {
  const rows = store.listAdmins(50);
  const lines = rows.map((a) => {
    const fixed = envOwner(a.tg_id);
    const who = [a.name, a.username ? '@' + a.username : null].filter(Boolean).join(' ');
    return `${a.role === 'owner' ? '👑' : '👤'} <code>${a.tg_id}</code>${who ? ' — ' + escapeHtml(who) : ''}` +
      (fixed ? ' <i>(sozlamadan)</i>' : '') +
      (a.added_by ? `\n    qo'shdi: <code>${a.added_by}</code>` : '') +
      (a.notify ? ' · 🔔' : '');
  });

  const keyboard = new InlineKeyboard().text('➕ ID bilan admin qo\'shish', 'p:aadd').row();
  for (const a of rows) {
    if (envOwner(a.tg_id)) continue;                          // sozlamadagilar o'chirilmaydi
    keyboard.text(`🗑 ${a.tg_id}`, `p:adel:${a.tg_id}`).row();
  }
  keyboard.text('🏛 Panel', 'p:menu');

  return {
    text: `👥 <b>Adminlar</b> — ${rows.length} ta\n\n${lines.join('\n\n') || 'Yo\'q.'}\n\n` +
      '<i>Yangi admin ID\'sini @userinfobot dan oladi. Admin bo\'lgan odam shu paneldan ' +
      'murojaatlarga javob bera oladi; «egasi» esa adminlarni ham boshqaradi.</i>',
    keyboard,
  };
}

function blockedView() {
  const rows = store.listBlocked(20);
  const keyboard = new InlineKeyboard();
  for (const u of rows) keyboard.text(`♻️ ${u.tg_id}`, `p:ub:${u.tg_id}`).row();
  keyboard.text('🏛 Panel', 'p:menu');
  const lines = rows.map((u) => `⛔️ <code>${u.tg_id}</code> ${escapeHtml([u.first_name, u.last_name].filter(Boolean).join(' '))}` +
    (u.block_reason ? `\n    ${escapeHtml(cut(u.block_reason, 60))}` : ''));
  return { text: `⛔️ <b>Bloklanganlar</b> — ${rows.length} ta\n\n${lines.join('\n') || 'Yo\'q.'}`, keyboard };
}

function overdueView() {
  const rows = store.listOverdue(config.slaHours * 3600_000, 10);
  const keyboard = new InlineKeyboard();
  for (const a of rows) keyboard.text(`${a.code} · ${shortAge(a.created_at)}`, `p:a:${a.id}`).row();
  keyboard.text('🏛 Panel', 'p:menu');
  const lines = rows.map((a) => `• <code>${a.code}</code> — ${shortAge(a.created_at)} (${escapeHtml(cut(a.author_name || '', 20))})\n` +
    `    ${escapeHtml(cut(a.body, 70))}`);
  return {
    text: `⚠️ <b>Javobsiz murojaatlar</b> (${config.slaHours} soatdan ortiq) — ${rows.length} ta\n\n` +
      (lines.join('\n\n') || '✅ Bunday murojaat yo\'q. Rahmat!'),
    keyboard,
  };
}

function logView() {
  const rows = store.listAdminLog(15);
  const lines = rows.map((r) => `• ${deps.localTime(r.created_at)} · <code>${r.actor_id}</code> → <b>${escapeHtml(r.action)}</b>` +
    (r.target_id ? ` <code>${r.target_id}</code>` : '') +
    (r.detail ? `\n    ${escapeHtml(cut(r.detail, 80))}` : ''));
  return {
    text: `📜 <b>Admin amallari jurnali</b> (oxirgi ${rows.length})\n\n${lines.join('\n') || 'Bo\'sh.'}`,
    keyboard: new InlineKeyboard().text('🏛 Panel', 'p:menu'),
  };
}

/* =====================================================================
   KO'RSATISH
   ===================================================================== */
async function open(ctx) {
  if (!isAdmin(ctx.from.id)) {
    await ctx.reply('⛔️ Panel faqat dekanat xodimlari uchun.');
    return;
  }
  store.touchAdmin(ctx.from.id, deps.fullName(ctx.from), ctx.from.username || null);
  await ctx.reply(menuText(ctx.from.id), { parse_mode: 'HTML', reply_markup: menuKeyboard(ctx.from.id) });
}

/** Tugma bosilganda xabarni joyida yangilaydi (bo'lmasa — yangi xabar) */
async function show(ctx, view) {
  try {
    await ctx.editMessageText(view.text, { parse_mode: 'HTML', reply_markup: view.keyboard });
  } catch (err) {
    if (String(err.description || err.message).includes('not modified')) return;
    await ctx.reply(view.text, { parse_mode: 'HTML', reply_markup: view.keyboard }).catch(() => {});
  }
}

async function askReply(ctx, text, action) {
  const sent = await ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: { force_reply: true, input_field_placeholder: 'Shu xabarga javob qilib yozing' },
  });
  rememberPrompt(ctx.chat.id, sent.message_id, action, ctx.from.id);
  return sent;
}

/* =====================================================================
   TUGMALAR
   ===================================================================== */
const pageOf = (raw) => {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 && n < 10_000 ? n : 0;
};

async function handleCallback(ctx) {
  const data = ctx.callbackQuery?.data || '';
  if (!data.startsWith('p:')) return false;

  /* Huquq HAR BOSISHDA qayta tekshiriladi */
  if (!isAdmin(ctx.from.id)) {
    await ctx.answerCallbackQuery({ text: 'Sizda panel huquqi yo\'q', show_alert: true }).catch(() => {});
    return true;
  }
  const ownerOnly = /^p:(ad|aadd|adel|bk|log)/.test(data);
  if (ownerOnly && !isOwner(ctx.from.id)) {
    await ctx.answerCallbackQuery({ text: 'Bu amal faqat panel egasi uchun', show_alert: true }).catch(() => {});
    return true;
  }
  store.touchAdmin(ctx.from.id, deps.fullName(ctx.from), ctx.from.username || null);

  const parts = data.split(':');
  const action = parts[1];

  try {
    switch (action) {
      case 'menu':
        await ctx.answerCallbackQuery();
        await show(ctx, { text: menuText(ctx.from.id), keyboard: menuKeyboard(ctx.from.id) });
        return true;

      case 'nop':
        await ctx.answerCallbackQuery();
        return true;

      case 'l':
        await ctx.answerCallbackQuery();
        await show(ctx, listView(parts[2] === 'all' ? 'all' : parts[2], pageOf(parts[3])));
        return true;

      case 'ov':
        await ctx.answerCallbackQuery();
        await show(ctx, overdueView());
        return true;

      case 'bl':
        await ctx.answerCallbackQuery();
        await show(ctx, blockedView());
        return true;

      case 'a': {
        const view = appealView(Number(parts[2]));
        if (!view) { await ctx.answerCallbackQuery({ text: 'Murojaat topilmadi', show_alert: true }); return true; }
        await ctx.answerCallbackQuery();
        await show(ctx, view);
        return true;
      }

      case 's': {
        const appeal = store.getAppeal(Number(parts[2]));
        if (!appeal) { await ctx.answerCallbackQuery({ text: 'Murojaat topilmadi', show_alert: true }); return true; }
        if (!store.STATUSES.includes(parts[3])) { await ctx.answerCallbackQuery({ text: 'Noto\'g\'ri holat' }); return true; }
        const updated = store.setAppealStatus(appeal.id, parts[3]);
        store.logAdminAction(ctx.from.id, 'holat_' + parts[3], appeal.id, appeal.code);
        await ctx.answerCallbackQuery({ text: `${appeal.code}: ${deps.STATUS_LABEL[parts[3]]}` });
        await show(ctx, appealView(appeal.id));
        await deps.refreshAppealCards(updated).catch(() => {});
        if (parts[3] === 'in_progress') deps.notifyAuthorInProgress(updated).catch(() => {});
        return true;
      }

      case 'b': {
        const appeal = store.getAppeal(Number(parts[2]));
        if (!appeal) { await ctx.answerCallbackQuery({ text: 'Murojaat topilmadi', show_alert: true }); return true; }
        const blocked = !store.getUser(appeal.tg_id)?.is_blocked;
        store.setUserBlocked(appeal.tg_id, blocked, blocked ? 'Panel orqali' : null);
        store.logAdminAction(ctx.from.id, blocked ? 'bloklandi' : 'blokdan_chiqdi', appeal.tg_id, appeal.code);
        await ctx.answerCallbackQuery({ text: blocked ? 'Bloklandi' : 'Blokdan chiqarildi' });
        await show(ctx, appealView(appeal.id));
        await deps.refreshAppealCards(store.getAppeal(appeal.id)).catch(() => {});
        return true;
      }

      case 'ub': {
        const tgId = Number(parts[2]);
        if (!Number.isFinite(tgId) || !store.getUser(tgId)) {
          await ctx.answerCallbackQuery({ text: 'Foydalanuvchi topilmadi', show_alert: true });
          return true;
        }
        store.setUserBlocked(tgId, false, null);
        store.logAdminAction(ctx.from.id, 'blokdan_chiqdi', tgId, null);
        await ctx.answerCallbackQuery({ text: 'Blokdan chiqarildi' });
        await show(ctx, blockedView());
        return true;
      }

      case 'f': {
        const appeal = store.getAppeal(Number(parts[2]));
        if (!appeal) { await ctx.answerCallbackQuery({ text: 'Murojaat topilmadi', show_alert: true }); return true; }
        const attachments = store.listAttachments(appeal.id, config.maxAttachmentsPerAppeal);
        await ctx.answerCallbackQuery({ text: `${attachments.length} ta fayl yuborilmoqda` });
        for (const attachment of attachments) {
          try {
            const sent = await deps.sendAttachment(ctx.chat.id, attachment, null);
            if (sent?.message_id) store.addRoute(ctx.chat.id, sent.message_id, appeal.id, 0);
          } catch (err) {
            log.warn('panel: fayl yuborilmadi', { code: appeal.code, error: String(err.message) });
          }
        }
        return true;
      }

      case 'r': {
        const appeal = store.getAppeal(Number(parts[2]));
        if (!appeal) { await ctx.answerCallbackQuery({ text: 'Murojaat topilmadi', show_alert: true }); return true; }
        await ctx.answerCallbackQuery();
        const sent = await askReply(ctx,
          `✍️ <b>${appeal.code}</b> uchun javob matnini shu xabarga «reply» qilib yozing.\n` +
          '<i>Rasm yoki hujjat ham ilova qilsangiz bo\'ladi — ular ham fuqaroga boradi.</i>',
          'answer');
        /* Javob marshruti — oddiy «reply» oqimi bilan bir xil ishlaydi */
        store.addRoute(ctx.chat.id, sent.message_id, appeal.id, 0);
        return true;
      }

      case 'q':
        await ctx.answerCallbackQuery();
        await askReply(ctx,
          `🔍 <b>Qidirish</b>\nMurojaat raqami, Telegram ID, username yoki matn yuboring.\n<i>${MARK.search}</i>`,
          'search');
        return true;

      case 'nt': {
        const me = store.getAdmin(ctx.from.id);
        if (!me) { await ctx.answerCallbackQuery({ text: 'Avval /panel yozing' }); return true; }
        store.setAdminNotify(ctx.from.id, !me.notify);
        await ctx.answerCallbackQuery({ text: me.notify ? 'Xabarnoma o\'chirildi' : 'Xabarnoma yoqildi' });
        await show(ctx, { text: menuText(ctx.from.id), keyboard: menuKeyboard(ctx.from.id) });
        return true;
      }

      case 'ad':
        await ctx.answerCallbackQuery();
        await show(ctx, adminsView());
        return true;

      case 'aadd':
        await ctx.answerCallbackQuery();
        await askReply(ctx,
          '➕ <b>Yangi admin</b>\nUning Telegram ID\'sini (faqat raqam) shu xabarga «reply» qilib yuboring.\n' +
          `<i>ID'ni @userinfobot beradi. ${MARK.addAdmin}</i>`,
          'add-admin');
        return true;

      case 'adel': {
        const tgId = Number(parts[2]);
        if (envOwner(tgId)) {
          await ctx.answerCallbackQuery({ text: 'Sozlamadagi egani paneldan o\'chirib bo\'lmaydi', show_alert: true });
          return true;
        }
        const target = store.getAdmin(tgId);
        if (!target) { await ctx.answerCallbackQuery({ text: 'Bunday admin yo\'q' }); return true; }
        if (target.role === 'owner' && store.countAdminsByRole('owner') <= 1) {
          await ctx.answerCallbackQuery({ text: 'Oxirgi egani o\'chirib bo\'lmaydi', show_alert: true });
          return true;
        }
        store.removeAdmin(tgId);
        store.logAdminAction(ctx.from.id, 'admin_ochirdi', tgId, target.name || null);
        await ctx.answerCallbackQuery({ text: `${tgId} ro'yxatdan o'chirildi` });
        await show(ctx, adminsView());
        await deps.bot.api.sendMessage(tgId, '⚠️ Dekanat paneli huquqi olib tashlandi.').catch(() => {});
        return true;
      }

      case 'bk': {
        await ctx.answerCallbackQuery({ text: 'Zaxira tayyorlanmoqda…' });
        const target = ctx.chat.type === 'private'
          ? ctx.chat.id
          : (config.backupChatId > 0 ? config.backupChatId : ctx.from.id);
        const result = await deps.sendBackupToTelegram({ force: true, chatId: target });
        store.logAdminAction(ctx.from.id, 'zaxira', null, result.sent ? 'yuborildi' : (result.error || result.reason));
        await ctx.reply(result.sent
          ? `💾 Zaxira ${ctx.chat.type === 'private' ? 'shu chatga' : 'shaxsiy chatga'} yuborildi.`
          : `⚠️ Yuborilmadi: ${escapeHtml(result.error || result.reason)}\n` +
            '<i>Bot sizga yozolmasa — unga shaxsiy «/start» yuboring.</i>',
          { parse_mode: 'HTML' });
        return true;
      }

      case 'log':
        await ctx.answerCallbackQuery();
        await show(ctx, logView());
        return true;

      default:
        await ctx.answerCallbackQuery();
        return true;
    }
  } catch (err) {
    log.error('panel tugmasi xatosi', { data, error: String(err.message) });
    await ctx.answerCallbackQuery({ text: 'Xatolik yuz berdi', show_alert: true }).catch(() => {});
    return true;
  }
}

/* =====================================================================
   «REPLY» BILAN KELGAN JAVOBLAR (ID qo'shish, qidirish)
   ===================================================================== */
async function handleReply(ctx) {
  const replyTo = ctx.message?.reply_to_message;
  if (!replyTo) return false;
  const promptText = replyTo.text || replyTo.caption || '';
  if (replyTo.from?.id !== ctx.me?.id) return false;

  const action = takePrompt(ctx.chat.id, replyTo.message_id, promptText);
  if (!action || action === 'answer') return false;      // javob oqimi bot.js da

  if (!isAdmin(ctx.from.id)) {
    await ctx.reply('⛔️ Sizda panel huquqi yo\'q.');
    return true;
  }

  const text = sanitizeText(ctx.message.text || ctx.message.caption, 200);

  if (action === 'add-admin') {
    if (!isOwner(ctx.from.id)) { await ctx.reply('⛔️ Admin qo\'shish faqat panel egasi uchun.'); return true; }
    const match = /^-?\d{3,15}$/.exec(text.trim());
    if (!match) {
      await ctx.reply('ID faqat raqamlardan iborat bo\'lishi kerak (masalan <code>123456789</code>).\n' +
        'Yangi admin ID\'sini @userinfobot dan oladi.', { parse_mode: 'HTML' });
      return true;
    }
    const tgId = Number(match[0]);
    if (tgId <= 0) { await ctx.reply('⚠️ Bu guruh ID\'si — admin sifatida odamning ID\'sini yozing.'); return true; }
    if (store.getAdmin(tgId)) { await ctx.reply(`<code>${tgId}</code> allaqachon admin.`, { parse_mode: 'HTML' }); return true; }

    const known = store.getUser(tgId);
    const added = store.addAdmin(tgId, {
      role: 'admin',
      name: known ? [known.first_name, known.last_name].filter(Boolean).join(' ') : null,
      username: known?.username || null,
      notify: config.adminChatIds.length ? 0 : 1,
      addedBy: ctx.from.id,
    });
    store.logAdminAction(ctx.from.id, 'admin_qoshdi', tgId, added.name || null);

    await ctx.reply(`✅ <code>${tgId}</code> admin qilindi.\n` +
      'U botga <code>/panel</code> yozib ishlay oladi.', { parse_mode: 'HTML' });
    await deps.bot.api.sendMessage(tgId,
      '🏛 <b>Sizga dekanat paneli huquqi berildi.</b>\n\n' +
      'Panelni ochish: <code>/panel</code>\n' +
      'U yerda murojaatlarni ko\'rish, javob berish va holatini o\'zgartirish mumkin.',
      { parse_mode: 'HTML' }).catch(() => {
      ctx.reply('ℹ️ Yangi adminga xabar yetmadi — u avval botga «/start» yozishi kerak.').catch(() => {});
    });
    return true;
  }

  if (action === 'search') {
    const rows = store.searchAppeals(text, 10);
    const keyboard = new InlineKeyboard();
    for (const a of rows) keyboard.text(`${a.code} · ${cut(a.author_name || '—', 14)}`, `p:a:${a.id}`).row();
    keyboard.text('🏛 Panel', 'p:menu');
    const lines = rows.map((a) => `• <code>${a.code}</code> · ${escapeHtml(cut(a.author_name || '', 20))} · ${shortAge(a.created_at)}\n` +
      `    ${escapeHtml(cut(a.body, 70))}`);
    await ctx.reply(`🔍 <b>«${escapeHtml(cut(text, 40))}»</b> bo'yicha ${rows.length} ta natija\n\n` +
      (lines.join('\n\n') || 'Hech narsa topilmadi.'), { parse_mode: 'HTML', reply_markup: keyboard });
    return true;
  }

  return false;
}

module.exports = {
  init, bootstrap, open, handleCallback, handleReply,
  isAdmin, isOwner, envOwner, PAGE_SIZE,
};
