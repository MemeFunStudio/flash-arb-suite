#!/usr/bin/env node
const fs = require('fs');
const file = 'exec-route-provider.cjs';
let s = fs.readFileSync(file, 'utf8');

// 1) Ensure PublicKey import exists
if (!/PublicKey/.test(s)) {
  s = "const { PublicKey } = require('@solana/web3.js');\n" + s;
}

// 2) Add a robust coercion helper once
if (!/\bconst\s+toPK\s*=/.test(s)) {
  s = s.replace(/^/, "const toPK = (x) => (x && typeof x.toBase58 === 'function') ? x : new PublicKey(String(x));\n");
}

// 3) Replace uniqPubkeys with a safe version that coerces inputs
const safeUniq = `
function uniqPubkeys(arr) {
  const seen = new Set();
  const out = [];
  for (const any of (arr || [])) {
    let pk;
    try { pk = toPK(any); } catch (_) { continue; }
    const b = pk.toBase58();
    if (!seen.has(b)) { seen.add(b); out.push(pk); }
  }
  return out;
}
`.trim();

if (/function\s+uniqPubkeys\s*\([^)]*\)\s*\{[\s\S]*?\}/.test(s)) {
  s = s.replace(/function\s+uniqPubkeys\s*\([^)]*\)\s*\{[\s\S]*?\}/, safeUniq);
} else {
  s = safeUniq + "\n" + s;
}

fs.writeFileSync(file, s);
console.log('patched uniqPubkeys in', file);
