#!/usr/bin/env node
const {Connection, PublicKey} = require('@solana/web3.js');
const fs = require('fs'), os = require('os');

const RPC  = process.env.RPC || 'https://api.devnet.solana.com';
const ENV  = process.env.ENV || (os.homedir()+'/.flash-arb/devnet.env');
// Raydium CLMM program id (devnet)
const RAY  = new PublicKey('DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH');

const to58 = (k)=> (k?.toBase58?.() ? k.toBase58() : String(k));

(async () => {
  const c = new Connection(RPC, 'confirmed');
  const sigs = await c.getSignaturesForAddress(RAY, {limit: 40});
  if (!sigs.length) { console.error('no recent CLMM txs on devnet'); process.exit(2); }

  const orders = [];
  for (const {signature} of sigs) {
    const tx = await c.getTransaction(signature, { maxSupportedTransactionVersion: 0 });
    if (!tx?.meta || tx.meta.err) continue;
    const msg = tx.transaction.message;
    const ak  = msg.accountKeys.map(k => to58(k?.pubkey || k));
    for (const ix of (msg.instructions||[])) {
      if (ak[ix.programIdIndex] !== to58(RAY)) continue;
      const ordered = ix.accounts.map(i => ak[i]);
      if (ordered.length) orders.push(ordered);
    }
    if (orders.length >= 3) break;
  }
  if (!orders.length) { console.error('no successful CLMM ixs found'); process.exit(3); }

  // flatten newest-first; preserve order + dedupe
  const merged = [];
  for (const ord of orders)
    for (const a of ord) if (a && !merged.includes(a)) merged.push(a);

  // load env & parse
  const raw = fs.readFileSync(ENV,'utf8').split(/\r?\n/);
  const kv  = {};
  for (const l of raw) {
    const m = /^export\s+([A-Z0-9_]+)=(.*)$/.exec(l);
    if (m) kv[m[1]] = m[2].replace(/^['"]|['"]$/g,'');
  }

  // canonical metas that must lead the remaining list
  const canonical = [
    kv.GLOBAL, kv.POOL, kv.VAULT_AUTHORITY, kv.VAULT, kv.CALLER,
    kv.TOKEN_PROGRAM, kv.ASSOCIATED_TOKEN_PROGRAM,
    kv.SYSTEM_PROGRAM, kv.SYSVAR_RENT, kv.MINT
  ].filter(Boolean);

  // existing EXTRA_*
  const old = raw.filter(l => /^EXTRA_\d+=/.test(l))
                 .map(l => l.split('=')[1].replace(/^['"]|['"]$/g,''))
                 .filter(Boolean);

  const final = [];
  const add = (x)=>{ if (x && !final.includes(x)) final.push(x); };
  canonical.forEach(add);
  merged.forEach(add);
  old.forEach(add);

  // rewrite file
  const keep   = raw.filter(l => !/^EXTRA_\d+=/.test(l));
  const extras = final.map((a,i) => `EXTRA_${i+1}=${a}`);
  fs.writeFileSync(ENV, keep.concat(extras).join('\n'));

  console.log(`copycat-any merged ${merged.length} ordered metas from live CLMM swaps into ${ENV}`);
})();
