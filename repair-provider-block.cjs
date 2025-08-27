#!/usr/bin/env node
const fs = require('fs');
const path = 'exec-route-provider.cjs';
let s = fs.readFileSync(path, 'utf8');

// 1) strip any accidental stub/warn lines or malformed leftovers
s = s.replace(/^\s*console\.warn\("\} else \{.*$/gm, '');
s = s.replace(/\[PORT\]\s*provider stubs not yet wired;?.*\n/g, '');

// 2) remove any existing PORT block to avoid double-wiring
s = s.replace(/if\s*\(\s*process\.env\.FL_PROVIDER\s*===\s*['"]PORT['"]\s*\)\s*\{[\s\S]*?\}\s*/m, '');

// 3) inject a fresh, correct PORT hook right after the ixs declaration
const hook = `
const FL = (process.env.FL_PROVIDER||'').toUpperCase();
if (FL === 'PORT') {
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

s = s.replace(/\bconst\s+ixs\s*=\s*\[\s*\]\s*;?/, (m)=> m + hook);

// 4) sanity: no unmatched braces introduced (cheap check)
const open = (s.match(/\{/g)||[]).length;
const close = (s.match(/\}/g)||[]).length;
if (open !== close) {
  throw new Error(`brace mismatch after patch: {=${open}} != }=${close}}`);
}

fs.writeFileSync(path, s);
console.log('repaired provider block and wired PORT');
