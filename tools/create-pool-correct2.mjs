import fs from 'fs';
import {createHash} from 'crypto';
import {Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction} from '@solana/web3.js';
import {getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID as SPL} from '@solana/spl-token';

function sighash(n){return createHash('sha256').update(`global:${n}`).digest().slice(0,8);}
function u16(n){const b=Buffer.alloc(2);b.writeUInt16LE(Number(n));return b;}

const e=process.env, rpc=e.DEVNET_RPC||'https://api.devnet.solana.com';
const conn=new Connection(rpc,'confirmed');
const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(e.SOLANA_KEYPAIR,'utf8'))));

const PROGRAM=new PublicKey(e.PROGRAM);
const GLOBAL=new PublicKey(e.GLOBAL);
const MINT=new PublicKey(e.MINT);
const TOKEN_PROGRAM=new PublicKey(e.TOKEN_PROGRAM||SPL.toBase58());
const OWNER=new PublicKey(e.OWNER||payer.publicKey.toBase58());

const [POOL]=PublicKey.findProgramAddressSync([Buffer.from('pool'), MINT.toBuffer(), OWNER.toBuffer()], PROGRAM);
const [VAULT_AUTH]=PublicKey.findProgramAddressSync([Buffer.from('vault_auth'), POOL.toBuffer()], PROGRAM);
const VAULT=await getAssociatedTokenAddress(MINT, VAULT_AUTH, true, TOKEN_PROGRAM, ASSOCIATED_TOKEN_PROGRAM_ID);

const ai=await conn.getAccountInfo(VAULT);
if(!ai){
  const t1=new Transaction().add(createAssociatedTokenAccountInstruction(payer.publicKey, VAULT, VAULT_AUTH, MINT, TOKEN_PROGRAM, ASSOCIATED_TOKEN_PROGRAM_ID));
  t1.feePayer=payer.publicKey; const {blockhash}=await conn.getLatestBlockhash('confirmed'); t1.recentBlockhash=blockhash; t1.sign(payer);
  const s1=await conn.sendRawTransaction(t1.serialize(),{skipPreflight:true,maxRetries:3}); await conn.confirmTransaction(s1,'confirmed');
  console.log('ATA_CREATE_SIG='+s1);
  console.log('ATA_EXPLORER=https://explorer.solana.com/tx/'+s1+'?cluster=devnet');
}

// exact Anchor order + metas
const keys=[
  {pubkey:GLOBAL,isSigner:false,isWritable:true},
  {pubkey:POOL,isSigner:false,isWritable:true},
  {pubkey:OWNER,isSigner:true,isWritable:true},
  {pubkey:MINT,isSigner:false,isWritable:true},
  {pubkey:VAULT,isSigner:false,isWritable:true},
  {pubkey:VAULT_AUTH,isSigner:false,isWritable:false},
  {pubkey:TOKEN_PROGRAM,isSigner:false,isWritable:false},
  {pubkey:SystemProgram.programId,isSigner:false,isWritable:false},
];

const data=Buffer.concat([sighash('create_pool'), u16(Number(e.MIN_PROFIT_BPS||5))]);
const ix=new TransactionInstruction({programId:PROGRAM,keys,data});
const tx=new Transaction().add(ix);
tx.feePayer=payer.publicKey; const {blockhash}=await conn.getLatestBlockhash('confirmed'); tx.recentBlockhash=blockhash; tx.sign(payer);
const sig=await conn.sendRawTransaction(tx.serialize(),{skipPreflight:true,maxRetries:3}); await conn.confirmTransaction(sig,'confirmed');

const info=await conn.getAccountInfo(POOL);
const ok=!!(info && info.owner.equals(PROGRAM) && info.data && info.data.length>0);
console.log('VAULT_AUTHORITY='+VAULT_AUTH.toBase58());
console.log('VAULT='+VAULT.toBase58());
console.log('POOL='+POOL.toBase58());
console.log('POOL_CREATE_SIG='+sig);
console.log('EXPLORER=https://explorer.solana.com/tx/'+sig+'?cluster=devnet');
console.log('POOL_OWNER='+(info?info.owner.toBase58():''));
console.log('POOL_DATALEN='+(info?info.data.length:0));
console.log('POOL_OK='+(ok?'YES':'NO'));
