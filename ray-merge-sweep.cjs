#!/usr/bin/env node
const {Connection, PublicKey} = require('@solana/web3.js');
const fs = require('fs'), os = require('os');

const RPC = process.env.RPC || 'https://api.devnet.solana.com';
const RAY_CLMM = new PublicKey('DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH');
const ENV = process.env.ENV || (os.homedir()+'/.flash-arb/devnet.env');

(async () => {
  const c = new Connection(RPC, 'confirmed');
  const sigs = await c.getSignaturesForAddress(RAY_CLMM, {limit: 15});
  if (!sigs.length) { console.error('no recent raydium clmm txs'); process.exit(2); }

  // pick the first tx that has an accountKeys array
  let picked = null, tx = null;
  for (const s of sigs) {
    tx = await c.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
    if (tx?.transaction?.message?.accountKeys?.length) { picked = s.signature; break; }
  }
  if (!picked) { console.error('no usable tx found'); process.exit(3); }

  const keys = tx.transaction.message.accountKeys.map(k => {
    return k?.pubkey?.toBase58?.() || k?.toBase58?.() || String(k);
  }).filter(Boolean);

  // read env
  const raw = fs.readFileSync(ENV,'utf8').split(/\r?\n/);
  const kv = {};
  for (const l of raw) {
    const m = /^export\s+([A-Z0-9_]+)=(.*)$/.exec(l);
    if (m) kv[m[1]] = m[2].replace(/^['"]|['"]$/g,'');
  }

  // canonical header that must remain first
  const canonical = [
    kv.GLOBAL,
    kv.POOL,
    kv.VAULT_AUTHORITY,
    kv.VAULT,
    kv.CALLER,
    kv.TOKEN_PROGRAM,
    kv.ASSOCIATED_TOKEN_PROGRAM,
    kv.SYSTEM_PROGRAM,
    kv.SYSVAR_RENT,
    kv.MINT,
  ].filter(Boolean);

  const oldExtras = raw.filter(l => /^EXTRA_\d+=/.test(l))
    .map(l => l.split('=')[1].replace(/^['"]|['"]$/g,''))
    .filter(Boolean);

  const ordered = [];
  const push = (x)=>{ if (x && !ordered.includes(x)) ordered.push(x); };
  canonical.forEach(push);
  keys.forEach(push);
  oldExtras.forEach(push);

  const keep = raw.filter(l => !/^EXTRA_\d+=/.test(l));
  const extras = ordered.map((a,i) => `EXTRA_${i+1}=${a}`);
  fs.writeFileSync(ENV, keep.concat(extras).join('\n'));
  console.log(`Ray sweep merged ${ordered.length} accounts from tx ${picked} into ${ENV}`);
})();
