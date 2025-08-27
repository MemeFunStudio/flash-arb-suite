#!/usr/bin/env node
const fs = require('fs');
const p = './exec-route-provider.cjs';
const s = fs.readFileSync(p,'utf8');

const before = `const extras = uniqPubkeys([...namedExtras, ...sweptExtras])
  .filter(pk => !baseSet.has(pk.toBase58()))
  .map(pk => ({ pubkey: pk, isSigner: false, isWritable: false }));

// keep well under 220 metas
const remaining = extras.slice(0, 200);`;

const after = `const extras = uniqPubkeys([...namedExtras, ...sweptExtras])
  // keep base too; program expects them in remaining_accounts
  .map(pk => ({ pubkey: pk, isSigner: false, isWritable: false }));

// include base metas at the front of remaining (non-signer)
const baseForRemaining = base.map(m => ({
  pubkey: m.pubkey,
  isSigner: false,
  isWritable: !!m.isWritable,
}));

// keep well under 220 metas
const remaining = [...baseForRemaining, ...extras]
  .reduce((acc, m) => { if (!acc.some(x => x.pubkey.equals(m.pubkey))) acc.push(m); return acc; }, [])
  .slice(0, 200);`;

if (!s.includes(before)) {
  console.error('patch anchor not found; aborting (runner content differs)');
  process.exit(1);
}
fs.writeFileSync(p, s.replace(before, after));
console.log('patched exec-route-provider.cjs to include base accounts in remaining');
