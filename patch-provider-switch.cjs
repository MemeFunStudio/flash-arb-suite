#!/usr/bin/env node
const fs=require('fs');
const p='exec-route-provider.cjs';
let s=fs.readFileSync(p,'utf8');

s=s.replace(/\[.*?unknown provider;.*\n/g,'');
s=s.replace(/if\s*\(\s*process\.env\.FL_PROVIDER[\s\S]*?\}\s*else\s*\{[\s\S]*?unknown provider[\s\S]*?\}\s*/m,'');

s=s.replace(/\bconst\s+ixs\s*=\s*\[\s*\]\s*;?/, m=>m+`
const FL=(process.env.FL_PROVIDER||'NONE').trim().toUpperCase();
if(FL==='PORT'){
  const { buildPortFlashLoanIxs } = require('./providers/port.cjs');
  const borrower = owner.publicKey;
  const amount = BigInt(process.env.FL_NOTIONAL_USDC||'10000000');
  const built = buildPortFlashLoanIxs(process.env, amount, borrower, program.programId, remainingAccounts);
  ixs.unshift(...built.preIxs);
  ixs.push(built.mainIx, ...built.postIxs);
} else if(FL==='NONE'){
} else {
  console.warn('['+FL+'] unknown provider; running as NONE.');
}
`);

fs.writeFileSync(p,s);
console.log('patched switch-provider in exec-route-provider.cjs');
