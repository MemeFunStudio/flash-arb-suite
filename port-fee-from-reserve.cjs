#!/usr/bin/env node
const {Connection, PublicKey} = require('@solana/web3.js');

(async () => {
  const RPC = process.env.RPC || 'https://api.devnet.solana.com';
  const reserve = new PublicKey(process.env.PORT_USDC_RESERVE);
  const supply  = new PublicKey(process.env.PORT_USDC_LIQ_SUPPLY);

  const conn = new Connection(RPC, 'confirmed');
  const info = await conn.getAccountInfo(reserve);
  if (!info) { console.error('no reserve account'); process.exit(1); }

  const buf = Buffer.from(info.data);
  const needle = supply.toBytes();

  let idx = -1;
  for (let i=0; i <= buf.length-32; i++) {
    let ok = true;
    for (let j=0; j<32; j++) if (buf[i+j] !== needle[j]) { ok=false; break; }
    if (ok) { idx = i; break; }
  }
  if (idx < 0) { console.error('supply vault bytes not found'); process.exit(2); }

  const feeBytes = buf.slice(idx+32, idx+64);
  const fee = new PublicKey(feeBytes).toBase58();

  process.stdout.write(JSON.stringify({
    RESERVE: reserve.toBase58(),
    SUPPLY:  supply.toBase58(),
    OFFSET:  idx,
    FEE_RECEIVER: fee
  }) + "\n");
})();
