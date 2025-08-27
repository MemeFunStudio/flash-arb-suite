#!/usr/bin/env node
const {Connection, PublicKey} = require('@solana/web3.js');
const fs = require('fs'), os = require('os');

const RPC     = process.env.RPC || 'https://api.devnet.solana.com';
const POOL    = new PublicKey(process.env.POOL);
const RAY_CLMM= new PublicKey('DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH');
const ENV     = process.env.ENV || (os.homedir()+'/.flash-arb/devnet.env');

const pk2 = (a)=> (a?.toBase58?.() ? a.toBase58() : String(a));

(async () => {
  const c = new Connection(RPC, 'confirmed');
  const sigs = await c.getSignaturesForAddress(POOL, {limit: 25});
  if (!sigs.length) { console.error('no recent POOL txs'); process.exit(2); }

  const orders = [];
  for (const {signature} of sigs) {
    const tx = await c.getTransaction(signature, { maxSupportedTransactionVersion: 0 });
    if (!tx?.transaction?.message) continue;
    const msg = tx.transaction.message;

    const ak = msg.accountKeys.map(k => pk2(k?.pubkey || k));
    const poolIdx = ak.indexOf(pk2(POOL));
    if (poolIdx < 0) continue;

    const ixs = msg.instructions || [];
    for (const ix of ixs) {
      const prog = ak[ix.programIdIndex];
      if (prog !== pk2(RAY_CLMM)) continue;
      // take the account order used by this CLMM ix
      const order = ix.accounts.map(i => ak[i]);
      // only keep ones that actually include the pool
      if (order.includes(pk2(POOL))) orders.push(order);
    }
  }

  if (!orders.length) { console.error('no CLMM swap ixs found on this POOL'); process.exit(3); }

  // flatten the most recent first; preserve order and dedupe across all
  const merged = [];
  const push = (x)=>{ if (x && !merged.includes(x)) merged.push(x); };
  orders.forEach(order => order.forEach(push));

  // load env lines
  const raw = fs.readFileSync(ENV,'utf8').split(/\r?\n/);
  const kv = {};
  for (const l of raw) {
    const m = /^export\s+([A-Z0-9_]+)=(.*)$/.exec(l);
    if (m) kv[m[1]] = m[2].replace(/^['"]|['"]$/g,'');
  }

  // canonical that must lead the remaining list (already correct for your program)
  const canonical = [
    kv.GLOBAL, kv.POOL, kv.VAULT_AUTHORITY, kv.VAULT, kv.CALLER,
    kv.TOKEN_PROGRAM, kv.ASSOCIATED_TOKEN_PROGRAM, kv.SYSTEM_PROGRAM,
    kv.SYSVAR_RENT, kv.MINT
  ].filter(Boolean);

  // extras already present
  const oldExtras = raw.filter(l => /^EXTRA_\d+=/.test(l))
    .map(l => l.split('=')[1].replace(/^['"]|['"]$/g,''))
    .filter(Boolean);

  const final = [];
  const add = (x)=>{ if (x && !final.includes(x)) final.push(x); };
  canonical.forEach(add);
  merged.forEach(add);
  oldExtras.forEach(add);

  // rewrite file
  const keep = raw.filter(l => !/^EXTRA_\d+=/.test(l));
  const extras = final.map((a,i) => `EXTRA_${i+1}=${a}`);
  fs.writeFileSync(ENV, keep.concat(extras).join('\n'));
  console.log(`copycat merged ${merged.length} ordered accounts from live CLMM swaps into ${ENV}`);
})();
