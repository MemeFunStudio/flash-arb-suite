import fs from 'fs';
import {createHash} from 'crypto';
import {Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction} from '@solana/web3.js';

function sighash(n){return createHash('sha256').update(`global:${n}`).digest().slice(0,8);}

const e=process.env;
const conn=new Connection(e.DEVNET_RPC||'https://api.devnet.solana.com','confirmed');
const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(e.SOLANA_KEYPAIR,'utf8'))));

const PROGRAM=new PublicKey(e.PROGRAM);
const OWNER=new PublicKey(e.OWNER||payer.publicKey.toBase58());

const seedsList=[
  ['global', [Buffer.from('global')]],
  ['global+owner', [Buffer.from('global'), OWNER.toBuffer()]],
];

async function tryInit(label,seeds){
  const [GLOBAL]=PublicKey.findProgramAddressSync(seeds, PROGRAM);
  const ai=await conn.getAccountInfo(GLOBAL);
  if(ai && ai.owner.equals(PROGRAM) && ai.data && ai.data.length>0){
    console.log('GLOBAL_LABEL='+label);
    console.log('GLOBAL_PDA='+GLOBAL.toBase58());
    console.log('GLOBAL_STATUS=EXISTS');
    console.log('GLOBAL_OWNER='+ai.owner.toBase58());
    console.log('GLOBAL_DLEN='+ai.data.length);
    return true;
  }
  const keys=[
    {pubkey:GLOBAL,isSigner:false,isWritable:true},
    {pubkey:payer.publicKey,isSigner:true,isWritable:true},
    {pubkey:SystemProgram.programId,isSigner:false,isWritable:false},
  ];
  const data=Buffer.concat([sighash('initialize_global'), new PublicKey(OWNER).toBuffer()]);
  const ix=new TransactionInstruction({programId:PROGRAM,keys,data});
  const tx=new Transaction().add(ix);
  tx.feePayer=payer.publicKey;
  const {blockhash}=await conn.getLatestBlockhash('confirmed');
  tx.recentBlockhash=blockhash;
  tx.sign(payer);
  const sig=await conn.sendRawTransaction(tx.serialize(),{skipPreflight:true,maxRetries:3});
  await conn.confirmTransaction(sig,'confirmed');
  const after=await conn.getAccountInfo(GLOBAL);
  console.log('TRY_LABEL='+label);
  console.log('GLOBAL_PDA='+GLOBAL.toBase58());
  console.log('INIT_SIG='+sig);
  console.log('EXPLORER=https://explorer.solana.com/tx/'+sig+'?cluster=devnet');
  console.log('GLOBAL_OK='+(after&&after.owner.equals(PROGRAM)&&after.data&&after.data.length>0));
  console.log('GLOBAL_DLEN='+(after?.data?.length||0));
  return Boolean(after&&after.owner.equals(PROGRAM)&&after.data&&after.data.length>0);
}

for(const [label,seeds] of seedsList){
  try{
    const ok=await tryInit(label,seeds);
    if(ok){ console.log('WIN_GLOBAL='+label); process.exit(0); }
  }catch(e){
    console.log('TRY_FAIL='+label);
    console.log('ERR='+String(e).slice(0,240));
  }
}
console.log('ALL_GLOBAL_TRIES_FAILED');
process.exit(2);
