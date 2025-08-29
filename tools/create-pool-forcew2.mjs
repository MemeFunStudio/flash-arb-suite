import fs from 'fs';
import {createHash} from 'crypto';
import {Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction} from '@solana/web3.js';
import {getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID as SPL_TOKEN_PROGRAM_ID} from '@solana/spl-token';

function sighash(n){return createHash('sha256').update(`global:${n}`).digest().slice(0,8);}
function u16(n){const b=Buffer.alloc(2);b.writeUInt16LE(Number(n));return b;}

const env=process.env;
const conn=new Connection(env.DEVNET_RPC||'https://api.devnet.solana.com','confirmed');
const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(env.SOLANA_KEYPAIR,'utf8'))));

const PROGRAM=new PublicKey(env.PROGRAM);
const GLOBAL=new PublicKey(env.GLOBAL);
const MINT=new PublicKey(env.MINT);
const TOKEN_PROGRAM=new PublicKey(env.TOKEN_PROGRAM||'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const SYSVAR_RENT=new PublicKey(env.SYSVAR_RENT||'SysvarRent111111111111111111111111111111111');
const OWNER=new PublicKey(env.OWNER||payer.publicKey.toBase58());

const [POOL]=PublicKey.findProgramAddressSync([Buffer.from('pool'), MINT.toBuffer(), OWNER.toBuffer()], PROGRAM);
const [VAULT_AUTHORITY]=PublicKey.findProgramAddressSync([Buffer.from('vault_auth'), POOL.toBuffer()], PROGRAM);
const VAULT=await getAssociatedTokenAddress(MINT, VAULT_AUTHORITY, true, TOKEN_PROGRAM, ASSOCIATED_TOKEN_PROGRAM_ID);

const ai=await conn.getAccountInfo(VAULT);
if(!ai){
  const tx1=new Transaction().add(createAssociatedTokenAccountInstruction(payer.publicKey, VAULT, VAULT_AUTHORITY, MINT, TOKEN_PROGRAM, ASSOCIATED_TOKEN_PROGRAM_ID));
  tx1.feePayer=payer.publicKey; const {blockhash}=await conn.getLatestBlockhash('confirmed'); tx1.recentBlockhash=blockhash; tx1.sign(payer);
  const s1=await conn.sendRawTransaction(tx1.serialize(),{skipPreflight:true,maxRetries:3}); await conn.confirmTransaction(s1,'confirmed');
  console.log('ATA_CREATE_SIG='+s1);
  console.log('ATA_EXPLORER=https://explorer.solana.com/tx/'+s1+'?cluster=devnet');
}

const keys=[
  {pubkey:GLOBAL,isSigner:false,isWritable:true},
  {pubkey:POOL,isSigner:false,isWritable:true},
  {pubkey:VAULT_AUTHORITY,isSigner:false,isWritable:false},
  {pubkey:VAULT,isSigner:false,isWritable:true},
  {pubkey:MINT,isSigner:false,isWritable:false},
  {pubkey:TOKEN_PROGRAM,isSigner:false,isWritable:false},
  {pubkey:SYSVAR_RENT,isSigner:false,isWritable:false},
  {pubkey:SystemProgram.programId,isSigner:false,isWritable:false},
  {pubkey:OWNER,isSigner:true,isWritable:true}
];

const data=Buffer.concat([sighash('create_pool'), u16(Number(env.MIN_PROFIT_BPS||5))]);
const ix=new TransactionInstruction({programId:PROGRAM,keys,data});
const tx=new Transaction().add(ix);
tx.feePayer=payer.publicKey; const {blockhash}=await conn.getLatestBlockhash('confirmed'); tx.recentBlockhash=blockhash; tx.sign(payer);
const sig=await conn.sendRawTransaction(tx.serialize(),{skipPreflight:true,maxRetries:3});
await conn.confirmTransaction(sig,'confirmed');

const info=await conn.getAccountInfo(POOL);
const ok=!!(info && info.owner.equals(PROGRAM) && info.data && info.data.length>0);
console.log('VAULT_AUTHORITY='+VAULT_AUTHORITY.toBase58());
console.log('VAULT='+VAULT.toBase58());
console.log('POOL='+POOL.toBase58());
console.log('POOL_CREATE_SIG='+sig);
console.log('EXPLORER=https://explorer.solana.com/tx/'+sig+'?cluster=devnet');
console.log('POOL_OWNER='+(info?info.owner.toBase58():''));
console.log('POOL_DATALEN='+(info?info.data.length:0));
console.log('POOL_OK='+(ok?'YES':'NO'));
