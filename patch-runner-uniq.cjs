#!/usr/bin/env node
const fs = require('fs');
const F = 'exec-route-provider.cjs';
let s = fs.readFileSync(F,'utf8');

// ensure PublicKey import exists
if (!/PublicKey/.test(s)) {
  s = "const { PublicKey } = require('@solana/web3.js');\n" + s;
}

// inject a robust toPK helper once
if (!/\btoPK\b\s*=/.test(s)) {
  s = s.replace(/\n/, `\nconst toPK = (x) => (x && typeof x.toBase58 === 'function') ? x : new PublicKey(String(x));\n`);
}

// replace (or add) uniqPubkeys to coerce inputs before dedupe
const uniqNew = `function uniqPubkeys(arr){
  const seen = new Set(), out = [];
  for (const any of (arr||[])) {
    const pk = toPK(any);
    const b = pk.toBase58();
    if (!seen.has(b)) { seen.add(b); out.push(pk); }
  }
  return out;
}`;
if (/function\s+uniqPubkeys\s*\([^)]*\)\s*\{[\s\S]*?\}/.test(s)) {
  s = s.replace(/function\s+uniqPubkeys\s*\([^)]*\)\s*\{[\s\S]*?\}/, uniqNew);
} else {
  s = uniqNew + "\n" + s;
}

// if extras are built without uniqPubkeys, wrap them
s = s.replace(
  /const\s+extras\s*=\s*\[\s*\.\.\s*namedExtras\s*,\s*\.\.\s*sweptExtras\s*\]\s*\.map\(\s*pk\s*=>\s*\(\{[^]*?\}\)\s*\);/m,
  `const extras = uniqPubkeys([...namedExtras, ...sweptExtras])
  .map(pk => ({ pubkey: pk, isSigner: false, isWritable: false }));`
);

// if remaining was previously "const remaining = extras.slice(0, 200);", keep the forced canonicals and dedupe by PublicKey
s = s.replace(
  /const\s+remaining\s*=\s*extras\.slice\(\s*0\s*,\s*200\s*\);/,
  `const forceRem = ["GLOBAL","POOL","VAULT_AUTHORITY","VAULT","CALLER","TOKEN_PROGRAM"]
  .map(k => new PublicKey(reqEnv(k)))
  .map(pk => ({ pubkey: pk, isSigner: false, isWritable: false }));
const remaining = uniqPubkeys([
  ...forceRem.map(x => x.pubkey),
  ...extras.map(x => x.pubkey),
]).map(pk => ({ pubkey: pk, isSigner: false, isWritable: false })).slice(0, 200);`
);

fs.writeFileSync(F,s);
console.log('patched', F);
