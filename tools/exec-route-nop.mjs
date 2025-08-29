import fs from 'fs';
import {createHash} from 'crypto';
import {Connection, Keypair, PublicKey, Transaction, TransactionInstruction} from '@solana/web3.js';

const e=process.env;
const conn=new Connection(e.DEVNET_RPC||'https://api.devnet.solana.com','confirmed');
const PROGRAM=new PublicKey(e.PROGRAM);
const GLOBAL=new PublicKey(e.GLOBAL);
const POOL=new PublicKey(e.POOL);
const TOKEN_PROG=new PublicKey(e.TOKEN_PROGRAM||'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(e.SOLANA_KEYPAIR,'utf8'))));

const [VA]=PublicKey.findProgramAddressSync([Buffer.from('vault_auth'), POOL.toBuffer()], PROGRAM);
const MINT=new PublicKey(e.MINT);
const {PublicKey:PK}=await import('@solana/web3.js'); // just to avoid bundlers if any
const sighash=(n)=>createHash('sha256').update(`global:${n}`).digest().slice(0,8);
const u64=(n)=>{const b=Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b;};
const u32=(n)=>{const b=Buffer.alloc(4); b.writeUInt32LE(n); return b;};

// args: principal:u64, route:Vec<SerializedInstruction>; for no-op => principal=0, route=[]
const data=Buffer.concat([sighash('execute_route'), u64(0), u32(0)]);

// accounts (order from IDL): global, pool, vault_authority, vault, caller, token_program
const VAULT=new PublicKey(e.VAULT);
const keys=[
  {pubkey:GLOBAL,isSigner:false,isWritable:true},
  {pubkey:POOL,isSigner:false,isWritable:true},
  {pubkey:VA,isSigner:false,isWritable:false},
  {pubkey:VAULT,isSigner:false,isWritable:true},
  {pubkey:payer.publicKey,isSigner:true,isWritable:true},
  {pubkey:TOKEN_PROG,isSigner:false,isWritable:false},
];

const ix=new TransactionInstruction({programId:PROGRAM,keys,data});
const tx=new Transaction().add(ix);
tx.feePayer=payer.publicKey;
tx.recentBlockhash=(await conn.getLatestBlockhash('confirmed')).blockhash;
tx.sign(payer);

const sig=await conn.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:3});
await conn.confirmTransaction(sig,'confirmed');

console.log('EXECUTE_SIG='+sig);
console.log('EXPLORER=https://explorer.solana.com/tx/'+sig+'?cluster=devnet');
