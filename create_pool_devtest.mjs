// create_pool_devtest.mjs (vault authority can be forced via VAULT_AUTH)
import { readFileSync } from 'fs';
import {
  Connection, Keypair, PublicKey, SystemProgram,
  Transaction, TransactionInstruction, sendAndConfirmTransaction,
} from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

const RPC_URL = 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey('9ckBy54vd9G6FmR63Z4PoLtNq8rbtoYzhVbJGx458Kmn');

const IDL_PATH   = 'idl/flash_executor.json';
const OWNER_PATH = 'phantom-owner.json';
const GLOBAL_PATH= 'global.json';

const MINT_STR  = process.env.MINT;                     // required
const MIN_BPS   = Number(process.env.MIN_BPS ?? '1');   // default 1 (0.01%)
const VA_OVERRIDE = process.env.VAULT_AUTH || '';       // optional: force vault authority

function loadKp(path){ return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path,'utf8')))); }

function poolPda(mint, owner){
  return PublicKey.findProgramAddressSync(
    [Buffer.from('pool'), mint.toBuffer(), owner.toBuffer()],
    PROGRAM_ID
  )[0];
}

// Fallback guess (won’t be used if VAULT_AUTH is provided)
function guessVaultAuthority(pool){
  return PublicKey.findProgramAddressSync([Buffer.from('vault'), pool.toBuffer()], PROGRAM_ID)[0];
}

(async () => {
  if (!MINT_STR) throw new Error('Set MINT=<mint pubkey> (e.g. Circle devnet USDC 4zMMC9...ncDU)');

  const conn   = new Connection(RPC_URL, 'confirmed');
  const owner  = loadKp(OWNER_PATH);
  const global = loadKp(GLOBAL_PATH).publicKey;
  const mint   = new PublicKey(MINT_STR);
  const pool   = poolPda(mint, owner.publicKey);

  // Use forced vault authority if provided; otherwise fallback guess (may fail)
  const vaultAuthority = VA_OVERRIDE ? new PublicKey(VA_OVERRIDE) : guessVaultAuthority(pool);
  const vaultAta = getAssociatedTokenAddressSync(
    mint, vaultAuthority, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // Ensure ATA exists
  try { await getAccount(conn, vaultAta); }
  catch {
    const ix = createAssociatedTokenAccountInstruction(
      owner.publicKey, vaultAta, vaultAuthority, mint,
      TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const ataTx = new Transaction().add(ix);
    ataTx.feePayer = owner.publicKey;
    ataTx.recentBlockhash = (await conn.getLatestBlockhash('finalized')).blockhash;
    const sig = await sendAndConfirmTransaction(conn, ataTx, [owner], { commitment: 'confirmed' });
    console.log('✅ Vault ATA created:', `https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  }

  // Build create_pool(min_profit_bps)
  const idl   = JSON.parse(readFileSync(IDL_PATH,'utf8'));
  const coder = new anchor.BorshCoder(idl);
  const def   = idl.instructions.find(i=>i.name==='create_pool');
  if (!def) throw new Error('create_pool not in IDL');

  const args = { min_profit_bps: MIN_BPS };

  const keys = [
    { pubkey: global,             isSigner:false, isWritable:true  }, // global
    { pubkey: pool,               isSigner:false, isWritable:true  }, // pool
    { pubkey: owner.publicKey,    isSigner:true,  isWritable:true  }, // owner
    { pubkey: mint,               isSigner:false, isWritable:false }, // mint
    { pubkey: vaultAuthority,     isSigner:false, isWritable:false }, // vault_authority (PDA addr)
    { pubkey: vaultAta,           isSigner:false, isWritable:true  }, // vault (ATA)
    { pubkey: TOKEN_PROGRAM_ID,   isSigner:false, isWritable:false },
    { pubkey: SystemProgram.programId, isSigner:false, isWritable:false },
  ];

  const data = coder.instruction.encode('create_pool', args);
  const ix   = new TransactionInstruction({ programId: PROGRAM_ID, keys, data });

  const tx = new Transaction().add(ix);
  tx.feePayer = owner.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash('finalized')).blockhash;

  console.log(`Sending create_pool (min_profit_bps=${MIN_BPS})…`);
  const sig = await sendAndConfirmTransaction(conn, tx, [owner], { commitment:'confirmed' });
  console.log('✅ create_pool sent:', sig);
  console.log(`Explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  console.log('Pool PDA:', pool.toBase58());
  console.log('Vault authority:', vaultAuthority.toBase58());
  console.log('Vault ATA:', vaultAta.toBase58());
})().catch(e => { console.error('FAILED create_pool:', e.message ?? e); process.exit(1); });
