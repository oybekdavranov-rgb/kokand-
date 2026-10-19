#!/usr/bin/env node
'use strict';
/* Parolni scrypt hash'ga aylantiradi:  npm run hash -- "MeningParolim123" */
const readline = require('readline');
const { hashPassword } = require('../src/security');

async function read() {
  const fromArg = process.argv.slice(2).join(' ').trim();
  if (fromArg) return fromArg;
  if (!process.stdin.isTTY) {
    console.error('Foydalanish: npm run hash -- "parol"');
    process.exit(1);
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const question = 'Parol (ko\'rinmaydi): ';
  rl._writeToOutput = function (text) { rl.output.write(text.includes(question) ? text : '*'); };
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); }));
}

(async () => {
  const password = await read();
  if (password.length < 12) {
    console.error('\n⛔️ Parol kamida 12 belgi bo\'lishi kerak.');
    process.exit(1);
  }
  console.log('\nADMIN_PASSWORD_HASH=' + hashPassword(password) + '\n');
  console.log('Shu qatorni .env fayliga qo\'ying va ADMIN_PASSWORD ni o\'chirib tashlang.');
})();
