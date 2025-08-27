import { readFileSync, writeFileSync } from 'fs';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';

const ARG = (f, d=null) => { const i=process.argv.indexOf(f); return i<0?d:process.argv[i+1] };
const TAG      = ARG('--tag', 'devtest');
const CLUSTER  = ARG('--cluster', 'devnet');
const LIMIT    = Number(ARG('--limit', '12'));
const AMOUNT   = Number(ARG('--amount', '0.25'));          // SOL
const REG_FILE = 'trading_wallets.json';
const PAYER    = 'phantom-owner.json';

const RPC = CLUSTER==='mainnet'
  ? 'https://api.mainnet-beta.solana.com'
  : CLUSTER==='testnet'
    ? 'https://api.testnet.solana.com'
    : 'https://api.devnet.solana.com';

function loadKeypair(path){
  const raw = readFileSync(path,'utf8');
  const arr = JSON.parse(raw); // 64-byte array from earlier
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

(async () => {
  const conn = new Connection(RPC, 'confirmed');
  const payer = loadKeypair(PAYER);
  const reg = JSON.parse(readFileSync(REG_FILE,'utf8'));

  const targets = reg
    .filter(e => e.cluster===CLUSTER && (!TAG || e.tag===TAG) && e.status!=='funded')
    .slice(0, LIMIT);

  if (!targets.length) { console.log('No wallets need funding.'); process.exit(0); }

  console.log(`Funding ${targets.length} wallet(s) with ${AMOUNT} SOL each from ${payer.publicKey.toBase58()}…`);
  for (const e of targets) {
    const to = new PublicKey(e.pubkey);
    const tx = new Transaction().add(SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: to,
      lamports: Math.floor(AMOUNT * LAMPORTS_PER_SOL),
    }));
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = (await conn.getLatestBlockhash('finalized')).blockhash;
    const sig = await sendAndConfirmTransaction(conn, tx, [payer], {commitment:'confirmed'});
    e.status = 'funded'; e.fundSig = sig;
    console.log(`✅ ${e.pubkey}  tx: https://explorer.solana.com/tx/${sig}?cluster=${CLUSTER}`);
  }
  writeFileSync(REG_FILE, JSON.stringify(reg, null, 2));
  console.log('Updated registry.');
})();
