#!/usr/bin/env node
const fs = require('fs');
const path = 'exec-route-provider.cjs';
let s = fs.readFileSync(path,'utf8');
const body = `
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
s = s.replace(/if\s*\(\s*process\.env\.FL_PROVIDER\s*===\s*['"]PORT['"]\s*\)\s*\{[\s\S]*?\}/m, body);
s = s.replace(/\[PORT\]\s*provider stubs not yet wired;?[^\n]*\n/g, '');
fs.writeFileSync(path, s);
console.log('force-wired PORT provider and removed stub notice');
