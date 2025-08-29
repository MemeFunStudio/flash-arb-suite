import fs from 'fs';
import {createHash} from 'crypto';
import {Connection, Keypair, PublicKey, Transaction, TransactionInstruction} from '@solana/web3.js';

const e=process.env;
const conn=new Connection(e.DEVNET_RPC||'https://api.devnet.solana.com','confirmed');
const PROGRAM=new PublicKey(e.PROGRAM);
const GLOBAL=new PublicKey(e.GLOBAL);
const POOL=new PublicKey(e.POOL);
const TOKEN_PROG=new PublicKey(e.TOKEN_PROGRAM||'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const VAULT=new PublicKey(e.VAULT);
const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(e.SOLANA_KEYPAIR,'utf8'))));

// derive vault_authority = ["vault_auth", POOL]
const [VA]=PublicKey.findProgramAddressSync([Buffer.from('vault_auth'), POOL.toBuffer()], PROGRAM);

const sighash=(n)=>createHash('sha256').update(`global:${n}`).digest().slice(0,8);
const u64=(n)=>{const b=Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b;};
const u32=(n)=>{const b=Buffer.alloc(4); b.writeUInt32LE(n>>>0); return b;};

// args: principal=0, route=[]
const data=Buffer.concat([sighash('execute_route'), u64(0), u32(0)]);

// Declared accounts (IDL order): global, pool, vault_authority, vault, caller, token_program
const declared=[
  {pubkey:GLOBAL,isSigner:false,isWritable:true},
  {pubkey:POOL,isSigner:false,isWritable:true},
  {pubkey:VA,isSigner:false,isWritable:false},
  {pubkey:VAULT,isSigner:false,isWritable:true},
  {pubkey:payer.publicKey,isSigner:true,isWritable:true},
  {pubkey:TOKEN_PROG,isSigner:false,isWritable:false},
];

// Remaining accounts MUST include the same six (any order is okay, but we’ll mirror the order)
const remaining=[
  {pubkey:GLOBAL,isSigner:false,isWritable:false},
  {pubkey:POOL,isSigner:false,isWritable:false},
  {pubkey:VAULT,isSigner:false,isWritable:false},
  {pubkey:VA,isSigner:false,isWritable:false},
  {pubkey:payer.publicKey,isSigner:false,isWritable:false},
  {pubkey:TOKEN_PROG,isSigner:false,isWritable:false},
];

const ix=new TransactionInstruction({programId:PROGRAM,keys:[...declared,...remaining],data});
const tx=new Transaction().add(ix);
tx.feePayer=payer.publicKey;
tx.recentBlockhash=(await conn.getLatestBlockhash('confirmed')).blockhash;
tx.sign(payer);

const sig=await conn.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:3});
await conn.confirmTransaction(sig,'confirmed');

console.log('EXECUTE_SIG='+sig);
console.log('EXPLORER=https://explorer.solana.com/tx/'+sig+'?cluster=devnet');
