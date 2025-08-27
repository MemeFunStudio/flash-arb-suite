#!/usr/bin/env node
const {Connection} = require('@solana/web3.js');
(async () => {
  const sig = process.argv[2];
  if (!sig) { console.error('usage: node get-logs.cjs <signature>'); process.exit(1); }
  const RPC = process.env.RPC || 'https://api.devnet.solana.com';
  const c = new Connection(RPC, 'confirmed');
  const r = await c.getTransaction(sig, { maxSupportedTransactionVersion: 0 });
  if (!r) { console.log('NOT_FOUND'); process.exit(2); }
  console.log('STATUS  :', r.meta?.err || 'OK');
  console.log('CU      :', r.meta?.computeUnitsConsumed);
  console.log('----- PROGRAM LOGS -----');
  console.log((r.meta?.logMessages || []).join('\n'));
})();
