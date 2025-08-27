#!/usr/bin/env node
const fs = require('fs');
const f = 'exec-route-provider.cjs';
let s = fs.readFileSync(f, 'utf8');

// Ensure PublicKey is available (in case this variant didn't import it)
if (!/PublicKey/.test(s)) {
  s = "const { PublicKey } = require('@solana/web3.js');\n" + s;
}

// 1) Coerce extras to PublicKey BEFORE uniqPubkeys
// 1a) If code already uses uniqPubkeys([...namedExtras, ...sweptExtras])
s = s.replace(
  /const extras\s*=\s*uniqPubkeys\(\s*\[\s*\.\.\s*namedExtras\s*,\s*\.\.\s*sweptExtras\s*\]\s*\)\s*\.map\(\s*pk\s*=>\s*\(\{[^]*?\}\)\s*\);/m,
  `const toPK = (x) => (x && typeof x.toBase58 === 'function') ? x : new PublicKey(String(x));
const extras = uniqPubkeys([...namedExtras, ...sweptExtras].map(toPK))
  .map(pk => ({ pubkey: pk, isSigner: false, isWritable: false }));`
);

// 1b) Or if it built extras directly from arrays (no uniq yet)
s = s.replace(
  /const extras\s*=\s*\[\s*\.\.\s*namedExtras\s*,\s*\.\.\s*sweptExtras\s*\]\s*\.map\(\s*pk\s*=>\s*\(\{[^]*?\}\)\s*\);/m,
  `const toPK = (x) => (x && typeof x.toBase58 === 'function') ? x : new PublicKey(String(x));
const extras = uniqPubkeys([...namedExtras, ...sweptExtras].map(toPK))
  .map(pk => ({ pubkey: pk, isSigner: false, isWritable: false }));`
);

// 2) Force canonicals at the FRONT of remaining (and dedupe by PublicKey)
if (!/const forceRem = \[/.test(s)) {
  s = s.replace(
    /const remaining\s*=\s*extras\.slice\(\s*0\s*,\s*200\s*\);/,
`const forceRem = ["GLOBAL","POOL","VAULT_AUTHORITY","VAULT","CALLER","TOKEN_PROGRAM"]
  .map(k => new PublicKey(reqEnv(k)))
  .map(pk => ({ pubkey: pk, isSigner: false, isWritable: false }));

const remaining = uniqPubkeys([
  ...forceRem.map(x => x.pubkey),
  ...extras.map(x => x.pubkey),
]).map(pk => ({ pubkey: pk, isSigner: false, isWritable: false })).slice(0, 200);`
  );
}

fs.writeFileSync(f, s);
console.log('patched', f);
