import {Connection, PublicKey} from '@solana/web3.js';
const DEVNET = process.env.DEVNET_RPC || 'https://api.devnet.solana.com';
const conn = new Connection(DEVNET, 'confirmed');

// Raydium CPMM program (devnet, official docs)
const CPMM = new PublicKey('DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb');
// USDC devnet mint
const USDC = new PublicKey(process.env.MINT || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

// Pull a sample of program accounts (cap to keep it quick)
const accs = await conn.getProgramAccounts(CPMM, { commitment: 'confirmed', dataSlice: {offset:0, length:0}, filters: [] });

// Re-fetch a small batch with full data to search for USDC mint bytes
const toCheck = accs.slice(0, 50); // keep small for speed
const usdcBytes = USDC.toBytes();
const found = [];
for (const a of toCheck) {
  const ai = await conn.getAccountInfo(a.pubkey, 'confirmed');
  if (!ai?.data) continue;
  // naive scan: does USDC mint pubkey appear in account data?
  const buf = Buffer.from(ai.data);
  if (buf.includes(Buffer.from(usdcBytes))) {
    found.push({addr: a.pubkey.toBase58(), dataLen: buf.length});
  }
}
if (found.length === 0) {
  console.log('NO_CPMM_POOLS_FOUND_FOR_USDC');
} else {
  for (const f of found) console.log(`CANDIDATE_POOL=${f.addr} DLEN=${f.dataLen}`);
}
