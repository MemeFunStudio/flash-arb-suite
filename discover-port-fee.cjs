#!/usr/bin/env node
'use strict';
const {Connection, PublicKey} = require('@solana/web3.js');

function toPk(x){ const v=(x==null?'':String(x)).trim(); if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)) throw new Error('bad pk '+x); return new PublicKey(v); }

const RPC  = process.env.RPC;
const PROG = toPk(process.env.PORT_PROG);
const MKT  = toPk(process.env.PORT_LENDING_MARKET);
const SUP  = toPk(process.env.PORT_USDC_LIQ_SUPPLY);
const USDC = toPk(process.env.MINT);

(async () => {
  const cx = new Connection(RPC, 'confirmed');
  const [auth] = await PublicKey.findProgramAddress([MKT.toBuffer()], PROG); // lending_market_authority
  const resp = await cx.getParsedTokenAccountsByOwner(auth, {mint: USDC});
  const list = resp.value.map(v => v.pubkey);
  const fee = list.find(pk => !pk.equals(SUP));
  const out = {AUTH: auth.toBase58(), CANDIDATES: list.map(x=>x.toBase58()), LIQ_SUPPLY: SUP.toBase58(), FEE_RECEIVER: fee?.toBase58() || null};
  console.log(JSON.stringify(out,null,2));
})();
