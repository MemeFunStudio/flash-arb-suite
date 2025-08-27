// set_pool_params.mjs
import { readFileSync } from 'fs';
import {
  Connection, Keypair, PublicKey, Transaction,
  TransactionInstruction, sendAndConfirmTransaction,
} from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';

const RPC_URL = 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey('9ckBy54vd9G6FmR63Z4PoLtNq8rbtoYzhVbJGx458Kmn');

const IDL_PATH    = 'idl/flash_executor.json';
const OWNER_PATH  = 'phantom-owner.json';
const GLOBAL_PATH = 'global.json';

const MINT_STR = process.env.MINT;                            // required
const MIN_BPS  = Number(process.env.MIN_BPS ?? '1');          // default 1 bps (0.01%)
const ENABLE   = /^(1|true|yes|on)$/i.test(process.env.ENABLE ?? 'true');  // default true

function loadKp(path){ return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path,'utf8')))); }

function poolPda(mint, owner){
  return PublicKey.findProgramAddressSync(
    [Buffer.from('pool'), mint.toBuffer(), owner.toBuffer()],
    PROGRAM_ID
  )[0];
}

(async () => {
  if (!MINT_STR) throw new Error('Set MINT=<token mint pubkey>');

  const conn   = new Connection(RPC_URL, 'confirmed');
  const owner  = loadKp(OWNER_PATH);
  const global = loadKp(GLOBAL_PATH).publicKey;
  const mint   = new PublicKey(MINT_STR);
  const pool   = poolPda(mint, owner.publicKey);

  const idl   = JSON.parse(readFileSync(IDL_PATH,'utf8'));
  const coder = new anchor.BorshCoder(idl);
  const def   = idl.instructions.find(i => i.name === 'set_pool_params');
  if (!def) throw new Error('set_pool_params not found in IDL');

  const args = { min_profit_bps: MIN_BPS, enabled: ENABLE };

  const keys = [
    { pubkey: global,           isSigner:false, isWritable:true  }, // global
    { pubkey: pool,             isSigner:false, isWritable:true  }, // pool
    { pubkey: owner.publicKey,  isSigner:true,  isWritable:true  }, // owner
  ];

  const data = coder.instruction.encode('set_pool_params', args);
  const ix   = new TransactionInstruction({ programId: PROGRAM_ID, keys, data });

  const tx = new Transaction().add(ix);
  tx.feePayer = owner.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash('finalized')).blockhash;

  console.log(`Sending set_pool_params (min_profit_bps=${MIN_BPS}, enabled=${ENABLE}) for pool: ${pool.toBase58()}`);
  const sig = await sendAndConfirmTransaction(conn, tx, [owner], { commitment: 'confirmed' });
  console.log('✅ set_pool_params sent:', sig);
  console.log(`Explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
})();
