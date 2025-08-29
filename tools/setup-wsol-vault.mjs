import fs from 'fs';
import {Connection, Keypair, PublicKey, SystemProgram, Transaction} from '@solana/web3.js';
import {getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createSyncNativeInstruction} from '@solana/spl-token';

const e=process.env;
const conn=new Connection(e.DEVNET_RPC||'https://api.devnet.solana.com','confirmed');
if(!e.SOLANA_KEYPAIR) throw new Error('MISSING_SOLANA_KEYPAIR');
const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(e.SOLANA_KEYPAIR,'utf8'))));
const PROGRAM=new PublicKey(e.PROGRAM);
const OWNER=(e.OWNER?new PublicKey(e.OWNER):payer.publicKey);
const NATIVE_MINT=new PublicKey('So11111111111111111111111111111111111111112');

const [POOL,POOL_BUMP]=PublicKey.findProgramAddressSync([Buffer.from('pool'),NATIVE_MINT.toBuffer(),OWNER.toBuffer()],PROGRAM);
const [VAULT_AUTHORITY]=PublicKey.findProgramAddressSync([Buffer.from('vault_auth'),POOL.toBuffer()],PROGRAM);
const VAULT=await getAssociatedTokenAddress(NATIVE_MINT,VAULT_AUTHORITY,true);

const ixs=[];
const ataInfo=await conn.getAccountInfo(VAULT,'confirmed');
if(!ataInfo){ ixs.push(createAssociatedTokenAccountInstruction(payer.publicKey,VAULT,VAULT_AUTHORITY,NATIVE_MINT)); }
const wrapLamports=Number(e.WRAP_SOL_LAMPORTS||1000000);
if(wrapLamports>0){ ixs.push(SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:VAULT,lamports:wrapLamports})); ixs.push(createSyncNativeInstruction(VAULT)); }

let sig='';
if(ixs.length){
  const tx=new Transaction().add(...ixs);
  tx.feePayer=payer.publicKey;
  tx.recentBlockhash=(await conn.getLatestBlockhash('confirmed')).blockhash;
  tx.sign(payer);
  sig=await conn.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:3});
  await conn.confirmTransaction(sig,'confirmed');
}

console.log('WSOL_MINT='+NATIVE_MINT.toBase58());
console.log('WSOL_POOL='+POOL.toBase58());
console.log('WSOL_POOL_BUMP='+POOL_BUMP);
console.log('WSOL_VAULT_AUTHORITY='+VAULT_AUTHORITY.toBase58());
console.log('WSOL_VAULT='+VAULT.toBase58());
console.log('WSOL_SETUP_SIG='+sig);
console.log('EXPLORER='+(sig?('https://explorer.solana.com/tx/'+sig+'?cluster=devnet'):''));
