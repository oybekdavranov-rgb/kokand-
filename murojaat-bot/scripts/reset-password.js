#!/usr/bin/env node
'use strict';
/* =====================================================================
   Parolni tiklash (parolni unutib qo'ysangiz):
     npm run reset-password -- <login> "<yangi parol>"
   Masalan:
     npm run reset-password -- dekanat "YangiKuchliParol2026"

   .env dagi ADMIN_PASSWORD_HASH faqat ENG BIRINCHI ishga tushishda
   ishlatiladi — admin bir marta yaratilgandan keyin parol BAZADA
   saqlanadi, shuning uchun uni shu skript orqali almashtiriladi.
   ===================================================================== */
const readline = require('readline');
const db = require('../src/db');
const { config } = require('../src/config');

function ask(question) {
  if (!process.stdin.isTTY) return Promise.resolve('');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = function (text) { rl.output.write(text.includes(question) ? text : '*'); };
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer.trim()); }));
}

(async () => {
  const [username, passwordArg] = process.argv.slice(2);
  const admins = db.listAdmins();

  if (!username) {
    console.log('\n  Foydalanish:  npm run reset-password -- <login> "<yangi parol>"\n');
    console.log('  Bazadagi adminlar:');
    if (!admins.length) console.log('   (hali admin yo\'q — serverni ishga tushiring, .env dagi ADMIN_* qiymatlaridan yaratiladi)');
    for (const admin of admins) {
      console.log(`   • ${admin.username} (${admin.role})${admin.is_disabled ? ' — o\'chirilgan' : ''}`);
    }
    console.log('\n  Ma\'lumot fayli: ' + config.dbFile + '\n');
    process.exit(admins.length ? 0 : 1);
  }

  const admin = db.getAdminByUsername(username);
  if (!admin) {
    console.error(`\n⛔️ "${username}" logini topilmadi. Mavjudlari: ${admins.map((a) => a.username).join(', ') || '(yo\'q)'}\n`);
    process.exit(1);
  }

  const password = passwordArg || await ask('Yangi parol (ko\'rinmaydi): ');
  if (!password || password.length < 12) {
    console.error('\n⛔️ Parol kamida 12 belgi bo\'lishi kerak.\n');
    process.exit(1);
  }

  db.setAdminPassword(admin.id, password);
  db.setAdminDisabled(admin.id, false);
  db.revokeAdminSessions(admin.id);          // barcha ochiq sessiyalar bekor qilinadi
  db.audit('console', 'password_reset', admin.username, 'reset-password skripti', null);
  db.close();

  console.log(`\n✅ "${admin.username}" uchun yangi parol o'rnatildi.`);
  console.log('   Barcha ochiq sessiyalar bekor qilindi — qaytadan kiring.');
  console.log('   Ikki qadamli kirish (agar yoqilgan bo\'lsa) o\'zgarishsiz qoldi.\n');
})();
