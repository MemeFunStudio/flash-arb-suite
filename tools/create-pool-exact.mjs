import fs from 'fs';
import { createHash } from 'crypto';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';

const e=process.env;
const conn=new Connection(e.DEVNET_RPC||'https://api.devnet.solana.com','confirmed');

function mustPk(name){
  let v=e[name]; if(!v) throw new Error('MISSING_ENV_'+name);
  v=String(v).trim(); try{ return new PublicKey(v);}catch{ throw new Error('INVALID_BASE58_'+name+':'+v); }
}
function optPk(name){
  let v=e[name]; if(!v) return null;
  v=String(v).trim(); try{ return new PublicKey(v);}catch{ return null; }
}

const PROGRAM=mustPk('PROGRAM');
const GLOBAL=mustPk('GLOBAL');
const MINT=mustPk('MINT');
if(!e.SOLANA_KEYPAIR) throw new Error('MISSING_ENV_SOLANA_KEYPAIR');
const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(e.SOLANA_KEYPAIR,'utf8'))));
const OWNER=(e.OWNER?new PublicKey(String(e.OWNER).trim()):payer.publicKey);

const [POOL,POOL_BUMP]=PublicKey.findProgramAddressSync([Buffer.from('pool'),MINT.toBuffer(),OWNER.toBuffer()],PROGRAM);
const [VA,VA_BUMP]=PublicKey.findProgramAddressSync([Buffer.from('vault_auth'),POOL.toBuffer()],PROGRAM);

let VAULT=optPk('VAULT');
async function ensureVault(){ if(VAULT) return VAULT; VAULT=await getAssociatedTokenAddress(MINT,VA,true); return VAULT; }

const sighash=(n)=>createHash('sha256').update(`global:${n}`).digest().slice(0,8);
const u16=(n)=>Buffer.from(Uint8Array.of(n&255,(n>>8)&255));
const data=Buffer.concat([sighash('create_pool'),u16(Number(e.MIN_PROFIT_BPS||5))]);

async function main(){
  await ensureVault();
  const TOKEN_PROG=optPk('TOKEN_PROGRAM')||new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
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
  try{
    const sig=await conn.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:3});
    await conn.confirmTransaction(sig,'confirmed');
    const info=await conn.getAccountInfo(POOL,'confirmed');
    const ok=!!(info&&info.owner.equals(PROGRAM)&&info.data&&info.data.length>0);
    console.log('POOL='+POOL.toBase58());
    console.log('POOL_BUMP='+POOL_BUMP);
    console.log('VAULT_AUTHORITY='+VA.toBase58());
    console.log('VAULT='+VAULT.toBase58());
    console.log('POOL_CREATE_SIG='+sig);
    console.log('EXPLORER=https://explorer.solana.com/tx/'+sig+'?cluster=devnet');
    console.log('POOL_OWNER='+(info?info.owner.toBase58():''));
    console.log('POOL_DLEN='+(info?info.data.length:0));
    console.log('POOL_OK='+(ok?'YES':'NO'));
  }catch(err){
    const logs=(err?.logs)||[];
    console.error('CREATE_POOL_ERROR='+ (err?.message||String(err)));
    if(logs.length) console.error('LOGS='+JSON.stringify(logs));
    process.exit(1);
  }
}
main().catch(e=>{console.error('CREATE_POOL_ERROR='+ (e?.message||String(e)));process.exit(1);});
