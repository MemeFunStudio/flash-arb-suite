#!/usr/bin/env node
const fs = require('fs'), os = require('os');
const envPath = process.env.ENV || (os.homedir()+'/.flash-arb/devnet.env');
const raw = fs.readFileSync(envPath,'utf8').split(/\r?\n/);

// parse exports
const kv = {};
for (const l of raw) {
  const m = /^export\s+([A-Z0-9_]+)=(.*)$/.exec(l);
  if (m) kv[m[1]] = m[2].replace(/^['"]|['"]$/g,'');
}
const canonical = [kv.GLOBAL, kv.POOL, kv.VAULT_AUTHORITY, kv.VAULT, kv.CALLER, kv.TOKEN_PROGRAM].filter(Boolean);

// old extras
const oldExtras = raw.filter(l => /^EXTRA_\d+=/.test(l))
  .map(l => l.split('=')[1].replace(/^['"]|['"]$/g,''))
  .filter(Boolean);

// merge, preserve order, dedupe
const ordered = [];
for (const a of [...canonical, ...oldExtras]) if (!ordered.includes(a)) ordered.push(a);

// rebuild file: remove old EXTRA_* and append new sequential ones
const keep = raw.filter(l => !/^EXTRA_\d+=/.test(l));
const extras = ordered.map((a,i) => `EXTRA_${i+1}=${a}`);
fs.writeFileSync(envPath, keep.concat(extras).join('\n'));
console.log(`Pinned/Merged ${ordered.length} EXTRA_* accounts to ${envPath}`);
