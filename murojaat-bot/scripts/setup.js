#!/usr/bin/env node
'use strict';
/* =====================================================================
   Birinchi sozlash yordamchisi:  npm run setup
   Maxfiy kalitlarni yaratadi va .env faylini to'ldiradi.
   Parol ochiq saqlanmaydi — darhol scrypt hash qilinadi.
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { hashPassword } = require('../src/security');

const ROOT = path.join(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env');
const randomSecret = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

function ask(question, { hidden = false, def = '' } = {}) {
  if (!process.stdin.isTTY) return Promise.resolve(def);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    rl._writeToOutput = function (text) { rl.output.write(text.includes(question) ? text : '*'); };
  }
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim() || def);
    });
  });
}

(async function main() {
  console.log('\n  ┌─ Murojaat boti — sozlash ────────────────────────────────┐');
  console.log('  │  Kalitlar yaratiladi, parol hash qilinadi.               │');
  console.log('  └──────────────────────────────────────────────────────────┘\n');

  if (fs.existsSync(ENV_FILE)) {
    console.log('  ⚠️  .env fayli allaqachon mavjud — ustiga yozmaymiz.\n');
    console.log('  Kerak bo\'lsa quyidagi yangi kalitlardan foydalaning:\n');
    console.log('  SESSION_SECRET=' + randomSecret(32));
    console.log('  WEBHOOK_SECRET=' + randomSecret(24) + '\n');
    console.log('  Parol hash qilish:  npm run hash\n');
    return;
  }

  const botToken  = await ask('  BOT_TOKEN (@BotFather): ');
  const username  = await ask('  Admin login [admin]: ', { def: 'admin' });
  let password    = await ask('  Admin parol (12+ belgi, ko\'rinmaydi): ', { hidden: true });
  const notifyIds = await ask('  Dekan/qabulxona Telegram chat ID (bo\'sh qoldirish mumkin): ');
  const publicUrl = await ask('  Panel manzili, masalan https://murojaat.example.uz (ixtiyoriy): ');

  if (!password) {
    password = randomSecret(12).replace(/[-_]/g, 'A').slice(0, 16);
    console.log('\n  🔐 Parol kiritilmadi — tasodifiy parol yaratildi:  ' + password);
    console.log('     Shu parolni xavfsiz joyda saqlang!\n');
  } else if (password.length < 12) {
    console.error('\n  ⛔️ Parol kamida 12 belgi bo\'lishi kerak. Qaytadan ishga tushiring.\n');
    process.exit(1);
  }

  const env = `# ===== Murojaat boti — ishlab chiqarish sozlamalari =====
# Yaratilgan: ${new Date().toISOString()}
# Bu faylni hech kimga bermang va git'ga qo'shmang!

NODE_ENV=production

# --- Telegram ---
BOT_TOKEN=${botToken}
BOT_MODE=${publicUrl ? 'webhook' : 'polling'}
NOTIFY_CHAT_IDS=${notifyIds}

# --- Web ---
PORT=8080
PUBLIC_URL=${publicUrl}
TRUST_PROXY=1
REQUIRE_HTTPS=${publicUrl ? 'true' : 'false'}

# --- Maxfiy kalitlar (hech qachon o'zgartirmasdan nusxalamang) ---
SESSION_SECRET=${randomSecret(32)}
WEBHOOK_SECRET=${randomSecret(24)}

# --- Admin (parol scrypt bilan hash qilingan — ochiq matn saqlanmaydi) ---
ADMIN_USERNAME=${username}
ADMIN_PASSWORD_HASH=${hashPassword(password)}

# --- Fakultet ma'lumotlari ---
FACULTY_NAME=Qo'qon universiteti Ta'lim fakulteti
DEAN_NAME=Xursanaliyev Boburmirzo Farhod o'g'li
DEAN_TITLE=dekan
OFFICE_HOURS=Dushanba–Shanba, 09:00–17:00

# --- Murojaat chegaralari ---
APPEAL_MIN_LENGTH=12
APPEAL_MAX_LENGTH=3500
APPEALS_PER_HOUR=4
APPEALS_PER_DAY=12
`;

  fs.writeFileSync(ENV_FILE, env, { mode: 0o600 });
  console.log('\n  ✅ .env yaratildi (huquq 600 — faqat egasi o\'qiydi).');
  console.log('  ▶️  Ishga tushirish:        npm start');
  if (publicUrl) console.log('  ▶️  Webhook ro\'yxatdan:     npm run webhook set');
  console.log('  ℹ️  Kirish:  login "' + username + '" + yuqoridagi parol\n');
})();
