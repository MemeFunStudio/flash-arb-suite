import fs from 'fs';
import {createHash} from 'crypto';
import {Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram} from '@solana/web3.js';
import {getAssociatedTokenAddress} from '@solana/spl-token';

const e=process.env;
const conn=new Connection(e.DEVNET_RPC||'https://api.devnet.solana.com','confirmed');
if(!e.SOLANA_KEYPAIR) throw new Error('MISSING_SOLANA_KEYPAIR');
const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(e.SOLANA_KEYPAIR,'utf8'))));

const PROGRAM=new PublicKey(e.PROGRAM);
const GLOBAL=new PublicKey(e.GLOBAL);
const OWNER=e.OWNER?new PublicKey(e.OWNER):payer.publicKey;
const MINT=new PublicKey('So11111111111111111111111111111111111111112');

const [POOL]=PublicKey.findProgramAddressSync([Buffer.from('pool'),MINT.toBuffer(),OWNER.toBuffer()],PROGRAM);
const [VA]=PublicKey.findProgramAddressSync([Buffer.from('vault_auth'),POOL.toBuffer()],PROGRAM);
const VAULT=await getAssociatedTokenAddress(MINT,VA,true);
const TOKEN_PROG=new PublicKey(e.TOKEN_PROGRAM||'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

const sighash=(n)=>createHash('sha256').update(`global:${n}`).digest().slice(0,8);
const u16=(n)=>{const b=Buffer.alloc(2);b.writeUInt16LE(n>>>0);return b;};
const data=Buffer.concat([sighash('create_pool'),u16(Number(e.MIN_PROFIT_BPS||0))]);

const keys=[
  {pubkey:GLOBAL,isSigner:false,isWritable:true},
  {pubkey:POOL,isSigner:false,isWritable:true},
  {pubkey:OWNER,isSigner:true,isWritable:true},
  {pubkey:MINT,isSigner:false,isWritable:false},
  {pubkey:VA,isSigner:false,isWritable:false},
  {pubkey:VAULT,isSigner:false,isWritable:true},
  {pubkey:TOKEN_PROG,isSigner:false,isWritable:false},
  {pubkey:SystemProgram.programId,isSigner:false,isWritable:false},
];

const ix=new TransactionInstruction({programId:PROGRAM,keys,data});
const tx=new Transaction().add(ix);
tx.feePayer=payer.publicKey;
tx.recentBlockhash=(await conn.getLatestBlockhash('confirmed')).blockhash;
tx.sign(payer);

const sig=await conn.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:3});
await conn.confirmTransaction(sig,'confirmed');

const info=await conn.getAccountInfo(POOL,'confirmed');
const ok=!!(info && info.owner.equals(PROGRAM) && info.data && info.data.length>0);

console.log('WSOL_MINT='+MINT.toBase58());
console.log('WSOL_POOL='+POOL.toBase58());
console.log('WSOL_VAULT_AUTHORITY='+VA.toBase58());
console.log('WSOL_VAULT='+VAULT.toBase58());
console.log('POOL_CREATE_SIG='+sig);
console.log('EXPLORER=https://explorer.solana.com/tx/'+sig+'?cluster=devnet');
console.log('POOL_OWNER='+(info?info.owner.toBase58():''));
console.log('POOL_DLEN='+(info?info.data.length:0));
console.log('POOL_OK='+(ok?'YES':'NO'));
