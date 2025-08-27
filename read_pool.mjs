// read_pool.mjs
import { readFileSync } from 'fs';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';

const RPC_URL = 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey('9ckBy54vd9G6FmR63Z4PoLtNq8rbtoYzhVbJGx458Kmn');

const IDL_PATH   = 'idl/flash_executor.json';
const OWNER_PATH = 'phantom-owner.json';

const MINT_STR = process.env.MINT; // required

function loadKp(path){
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path,'utf8'))));
}

function poolPda(mint, owner){
  return PublicKey.findProgramAddressSync(
    [Buffer.from('pool'), mint.toBuffer(), owner.toBuffer()],
    PROGRAM_ID
  )[0];
}

function pretty(obj){
  return JSON.stringify(obj, (k, v) => (v && typeof v === 'object' && 'toBase58' in v) ? v.toBase58() : v, 2);
}

(async () => {
  if (!MINT_STR) throw new Error('Set MINT=<token mint pubkey>');
  const conn  = new Connection(RPC_URL, 'confirmed');
  const owner = loadKp(OWNER_PATH);
  const mint  = new PublicKey(MINT_STR);
  const pool  = poolPda(mint, owner.publicKey);

  const idl   = JSON.parse(readFileSync(IDL_PATH,'utf8'));
  const coder = new anchor.BorshCoder(idl);

  const info = await conn.getAccountInfo(pool);
  if (!info){ console.log('Pool not found:', pool.toBase58()); return; }

  // IDL account name is "TokenPool"
  const acc = coder.accounts.decode('TokenPool', info.data);
  console.log('Pool PDA :', pool.toBase58());
  console.log(pretty(acc));
})();
