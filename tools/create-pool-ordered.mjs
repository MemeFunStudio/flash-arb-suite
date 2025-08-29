import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';

function pk(x){ return new PublicKey(String(x)); }

const RPC = process.env.RPC || 'https://api.devnet.solana.com';
const PROGRAM = pk(process.env.PROGRAM);
const GLOBAL = pk(process.env.GLOBAL);
const POOL = pk(process.env.POOL);
const VAULT_AUTHORITY = pk(process.env.VAULT_AUTHORITY);
const VAULT = pk(process.env.VAULT);
const MINT = pk(process.env.MINT);
const TOKEN_PROG = pk(process.env.TOKEN_PROGRAM || 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const SYSVAR_RENT = pk(process.env.SYSVAR_RENT || 'SysvarRent111111111111111111111111111111111');
const SYSTEM = pk('11111111111111111111111111111111');

const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.env.SOLANA_KEYPAIR, 'utf8'))));

const disc = createHash('sha256').update('global:create_pool').digest().slice(0, 8);
const data = Buffer.from(disc);

const keys = [
  { pubkey: GLOBAL, isSigner: false, isWritable: true },
  { pubkey: POOL, isSigner: false, isWritable: true },
  { pubkey: VAULT_AUTHORITY, isSigner: false, isWritable: false },
  { pubkey: VAULT, isSigner: false, isWritable: true },
  { pubkey: MINT, isSigner: false, isWritable: false },
  { pubkey: TOKEN_PROG, isSigner: false, isWritable: false },
  { pubkey: SYSTEM, isSigner: false, isWritable: false },
  { pubkey: SYSVAR_RENT, isSigner: false, isWritable: false }
];

const ix = new TransactionInstruction({ programId: PROGRAM, keys, data });

(async () => {
  const conn = new Connection(RPC, 'confirmed');
  const tx = new Transaction().add(ix);
  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash('confirmed')).blockhash;

  tx.feePayer = payer.publicKey;
const {blockhash}=await conn.getLatestBlockhash("confirmed");
tx.recentBlockhash = blockhash;
const sim = await conn.simulateTransaction(tx);
  const logs = (sim.value && sim.value.logs) ? sim.value.logs : [];
  console.log('SIM_OK=' + String(!sim.value?.err));
  console.log('SIM_LOGS=' + JSON.stringify(logs));
  if (sim.value && sim.value.err){ console.log('SIM_ERR=' + JSON.stringify(sim.value.err)); process.exit(1); }

  tx.sign(payer);
  const sig = await sendAndConfirmTransaction(conn, tx, [payer], { commitment: 'confirmed', skipPreflight: false });
  console.log('POOL_CREATE_SIG=' + sig);
  console.log('EXPLORER=https://explorer.solana.com/tx/' + sig + '?cluster=devnet');
})();
