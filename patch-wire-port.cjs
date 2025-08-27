#!/usr/bin/env node
const fs = require('fs');
let s = fs.readFileSync('exec-route-provider.cjs','utf8');
const block = `
if (process.env.FL_PROVIDER === 'PORT') {
  const { buildPortFlashLoanIxs } = require('./providers/port.cjs');
  const borrower = owner.publicKey;
  const amount = BigInt(process.env.FL_NOTIONAL_USDC || '10000000');
  const callbackProg = program.programId;
  const callbackAcctMetas = remainingAccounts;
  const built = buildPortFlashLoanIxs(process.env, amount, borrower, callbackProg, callbackAcctMetas);
  ixs.unshift(...built.preIxs);
  ixs.push(built.mainIx, ...built.postIxs);
}
`;
const re = /if\s*\(\s*process\.env\.FL_PROVIDER\s*===\s*['"]PORT['"]\s*\)\s*\{[\s\S]*?\}/m;
if (re.test(s)) s = s.replace(re, block);
else s = s.replace(/\/\/\s*PROVIDER\s*SWITCH\s*START/i, '// PROVIDER SWITCH START\n' + block);
fs.writeFileSync('exec-route-provider.cjs', s);
console.log('wired PORT provider in exec-route-provider.cjs');
