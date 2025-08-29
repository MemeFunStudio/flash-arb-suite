import fs from 'fs';
import {createHash} from 'crypto';
import {Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction} from '@solana/web3.js';

function sighash(n){return createHash('sha256').update(`global:${n}`).digest().slice(0,8);}
function as32(pk){return new PublicKey(pk).toBytes();}

const e=process.env;
const conn=new Connection(e.DEVNET_RPC||'https://api.devnet.solana.com','confirmed');
const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(e.SOLANA_KEYPAIR,'utf8'))));

const PROGRAM=new PublicKey(e.PROGRAM);
const OWNER=new PublicKey(e.OWNER||payer.publicKey.toBase58());
const [GLOBAL]=PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAM);

const info=await conn.getAccountInfo(GLOBAL);
if(info){
  console.log('GLOBAL_PDA='+GLOBAL.toBase58());
  console.log('GLOBAL_EXISTS=true');
  console.log('GLOBAL_OWNER='+info.owner.toBase58());
  console.log('GLOBAL_DLEN='+(info.data?.length||0));
  process.exit(0);
}

const keys=[
  {pubkey:GLOBAL,isSigner:false,isWritable:true},
  {pubkey:payer.publicKey,isSigner:true,isWritable:true},
  {pubkey:SystemProgram.programId,isSigner:false,isWritable:false},
];

const data=Buffer.concat([sighash('initialize_global'), Buffer.from(as32(OWNER))]);
const ix=new TransactionInstruction({programId:PROGRAM,keys,data});
const tx=new Transaction().add(ix);
tx.feePayer=payer.publicKey;
const {blockhash}=await conn.getLatestBlockhash('confirmed');
tx.recentBlockhash=blockhash;
tx.sign(payer);

const sig=await conn.sendRawTransaction(tx.serialize(),{skipPreflight:true,maxRetries:3});
await conn.confirmTransaction(sig,'confirmed');

const after=await conn.getAccountInfo(GLOBAL);
console.log('GLOBAL_PDA='+GLOBAL.toBase58());
console.log('INIT_SIG='+sig);
console.log('EXPLORER=https://explorer.solana.com/tx/'+sig+'?cluster=devnet');
console.log('GLOBAL_OK='+Boolean(after&&after.owner.equals(PROGRAM)&&after.data&&after.data.length>0));
console.log('GLOBAL_DLEN='+(after?.data?.length||0));
