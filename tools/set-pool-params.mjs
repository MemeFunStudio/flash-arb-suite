import fs from 'fs';
import {createHash} from 'crypto';
import {Connection, Keypair, PublicKey, Transaction, TransactionInstruction} from '@solana/web3.js';

const e=process.env;
const conn=new Connection(e.DEVNET_RPC||'https://api.devnet.solana.com','confirmed');
const PROGRAM=new PublicKey(e.PROGRAM);
const GLOBAL=new PublicKey(e.GLOBAL);
const POOL=new PublicKey(e.POOL);
const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(e.SOLANA_KEYPAIR,'utf8'))));
const OWNER=new PublicKey(e.OWNER||payer.publicKey.toBase58());

const sighash=(n)=>createHash('sha256').update(`global:${n}`).digest().slice(0,8);
const u16=(n)=>Buffer.from(Uint8Array.of(n&255,(n>>8)&255));
const u8=(b)=>Buffer.from([b?1:0]);

const mbps=Number(e.MIN_PROFIT_BPS_SET||0);
const enabled=(String(e.POOL_ENABLED||'true').toLowerCase()!=='false');
const data=Buffer.concat([sighash('set_pool_params'),u16(mbps),u8(enabled)]);

const keys=[
  {pubkey:GLOBAL,isSigner:false,isWritable:true},
  {pubkey:POOL,isSigner:false,isWritable:true},
  {pubkey:OWNER,isSigner:true,isWritable:true},
];

const ix=new TransactionInstruction({programId:PROGRAM,keys,data});
const tx=new Transaction().add(ix);
tx.feePayer=payer.publicKey;
tx.recentBlockhash=(await conn.getLatestBlockhash('confirmed')).blockhash;
tx.sign(payer);

const sig=await conn.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:3});
await conn.confirmTransaction(sig,'confirmed');

console.log('POOL_PARAMS_SIG='+sig);
console.log('EXPLORER=https://explorer.solana.com/tx/'+sig+'?cluster=devnet');
console.log('MIN_PROFIT_BPS_SET='+mbps);
console.log('POOL_ENABLED='+(enabled?'true':'false'));
