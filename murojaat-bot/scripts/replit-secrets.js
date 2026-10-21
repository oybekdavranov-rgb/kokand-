#!/usr/bin/env node
'use strict';
/* =====================================================================
   Replit uchun maxfiy kalitlarni tayyorlaydi:
       node scripts/replit-secrets.js "MeningKuchliParolim2026"
   Parol berilmasa — tasodifiy parol yaratiladi va ekranda ko'rsatiladi.

   Chiqqan qiymatlarni Replit'dagi "Secrets" (🔒) bo'limiga ko'chirasiz.
   .env fayli SHART EMAS — Replit Secrets to'g'ridan-to'g'ri environment
   o'zgaruvchilari sifatida beriladi.
   ===================================================================== */
const crypto = require('crypto');
const { hashPassword } = require('../src/security');

const randomSecret = (bytes) => crypto.randomBytes(bytes).toString('base64url');

function randomPassword() {
  /* O'qilishi oson, lekin kuchli: 4 bo'lak × 4 belgi */
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const pick = () => alphabet[crypto.randomInt(alphabet.length)];
  return Array.from({ length: 4 }, () => Array.from({ length: 4 }, pick).join('')).join('-');
}

const password = (process.argv.slice(2).join(' ').trim()) || randomPassword();
if (password.length < 12) {
  console.error('\n⛔️ Parol kamida 12 belgi bo\'lishi kerak.\n');
  process.exit(1);
}

const secrets = {
  BOT_TOKEN: '(@BotFather bergan tokenni shu yerga yozing)',
  SESSION_SECRET: randomSecret(32),
  WEBHOOK_SECRET: randomSecret(24),
  ADMIN_USERNAME: 'dekanat',
  ADMIN_PASSWORD_HASH: hashPassword(password),
  NOTIFY_CHAT_IDS: '(dekan/dekanat Telegram chat ID — @userinfobot beradi)',
};

const line = '─'.repeat(64);
console.log('\n' + line);
console.log('  REPLIT SECRETS — quyidagilarni 🔒 Secrets bo\'limiga qo\'shing');
console.log(line + '\n');
for (const [key, value] of Object.entries(secrets)) {
  console.log(`  ${key}`);
  console.log(`  ${value}\n`);
}
console.log(line);
console.log('  PANELGA KIRISH');
console.log(line);
console.log(`  Login:  ${secrets.ADMIN_USERNAME}`);
console.log(`  Parol:  ${password}`);
console.log('\n  ⚠️  Parolni hoziroq xavfsiz joyga ko\'chirib oling — u boshqa');
console.log('      ko\'rsatilmaydi (bazada faqat hash saqlanadi).');
console.log('      Unutib qo\'ysangiz:  npm run reset-password -- dekanat "YangiParol"');
console.log(line + '\n');
