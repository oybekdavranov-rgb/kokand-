#!/usr/bin/env node
'use strict';
/* =====================================================================
   Webhook boshqaruvi:
     npm run webhook set      — Telegram'da webhook'ni ro'yxatdan o'tkazish
     npm run webhook info     — hozirgi holat
     npm run webhook delete   — webhook'ni olib tashlash (polling'ga qaytish)
   ===================================================================== */
const { config } = require('../src/config');

const action = (process.argv[2] || 'info').toLowerCase();

async function call(method, payload) {
  const response = await fetch(`${config.botApiRoot}/bot${config.botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.description || 'Telegram xatosi');
  return data.result;
}

(async () => {
  if (!config.botToken) { console.error('⛔️ BOT_TOKEN yo\'q (.env ni tekshiring).'); process.exit(1); }

  try {
    if (action === 'set') {
      if (!config.webhookUrl) { console.error('⛔️ PUBLIC_URL ko\'rsatilmagan.'); process.exit(1); }
      if (config.webhookSecret.length < 24) { console.error('⛔️ WEBHOOK_SECRET kamida 24 belgi bo\'lishi kerak.'); process.exit(1); }
      await call('setWebhook', {
        url: config.webhookUrl,
        secret_token: config.webhookSecret,
        allowed_updates: ['message', 'callback_query'],
        max_connections: 40,
        drop_pending_updates: false,
      });
      console.log('✅ Webhook o\'rnatildi:', config.webhookUrl.replace(/\/tg\/.*/, '/tg/***'));
    } else if (action === 'delete') {
      await call('deleteWebhook', { drop_pending_updates: false });
      console.log('✅ Webhook olib tashlandi (polling rejimiga qaytish mumkin).');
    }

    const info = await call('getWebhookInfo');
    const me = await call('getMe');
    console.log('\n  Bot:              @' + me.username);
    console.log('  Webhook:          ' + (info.url ? info.url.replace(/\/tg\/.*/, '/tg/***') : '(yo\'q)'));
    console.log('  Maxfiy sarlavha:  ' + (info.url ? 'yoqilgan' : '—'));
    console.log('  Kutayotgan:       ' + (info.pending_update_count || 0));
    if (info.last_error_message) console.log('  ⚠️ Oxirgi xato:    ' + info.last_error_message);
    console.log('');
  } catch (err) {
    console.error('⛔️ Xato:', err.message);
    process.exit(1);
  }
})();
