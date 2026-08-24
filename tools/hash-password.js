#!/usr/bin/env node
/* Generate an ADMIN_PASSWORD_HASH for the .env / hosting panel.
   Usage:
     npm run hash-password -- "my-strong-password"
     node tools/hash-password.js "my-strong-password"
   (If no password is passed, you'll be prompted.)                       */
'use strict';
const { hashPassword } = require('../lib/auth');

function output(pw) {
  if (!pw || pw.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }
  const hash = hashPassword(pw);
  console.log('\nAdd this to your .env or hosting Environment Variables:\n');
  console.log('ADMIN_PASSWORD_HASH=' + hash + '\n');
}

const arg = process.argv[2];
if (arg) { output(arg); }
else {
  process.stdout.write('Enter admin password: ');
  const chunks = [];
  process.stdin.on('data', (d) => chunks.push(d));
  process.stdin.on('end', () => output(Buffer.concat(chunks).toString('utf8').trim()));
}
