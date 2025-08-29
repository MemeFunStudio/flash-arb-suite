import fs from 'fs';
import {createHash} from 'crypto';
import {Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction} from '@solana/web3.js';

function sighash(n){return createHash('sha256').update(`global:${n}`).digest().slice(0,8);}
function u8(n){return Buffer.from([Number(n)&0xff]);}
function u16(n){const b=Buffer.alloc(2);b.writeUInt16LE(Number(n));return b;}
function u32(n){const b=Buffer.alloc(4);b.writeUInt32LE(Number(n));return b;}
function u64(n){const b=Buffer.alloc(8);let lo=n>>>0,hi=Math.floor(n/2**32)>>>0;b.writeUInt32LE(lo,0);b.writeUInt32LE(hi,4);return b;}

const env=process.env;
const PROGRAM=new PublicKey(env.PROGRAM);
const GLOBAL=new PublicKey(env.GLOBAL);
const POOL=new PublicKey(env.POOL);
const VAULT_AUTHORITY=new PublicKey(env.VAULT_AUTHORITY);
const VAULT=new PublicKey(env.VAULT);
const MINT=new PublicKey(env.MINT);
const TOKEN_PROG=new PublicKey(env.TOKEN_PROGRAM||'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const SYSVAR_RENT=new PublicKey(env.SYSVAR_RENT||'SysvarRent111111111111111111111111111111111');

const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(env.SOLANA_KEYPAIR,'utf8'))));
const rpc=env.DEVNET_RPC||'https://api.devnet.solana.com';
const conn=new Connection(rpc,'confirmed');

const names=['create_pool','createPool'];
const encs=[u8,u16,u32,u64];
const bps=Number(env.MIN_PROFIT_BPS||5);

const keys=[
  {pubkey:GLOBAL,isSigner:false,isWritable:true},
  {pubkey:POOL,isSigner:false,isWritable:true},
  {pubkey:VAULT_AUTHORITY,isSigner:false,isWritable:true},
  {pubkey:VAULT,isSigner:false,isWritable:true},
  {pubkey:MINT,isSigner:false,isWritable:false},
  {pubkey:TOKEN_PROG,isSigner:false,isWritable:false},
  {pubkey:SYSVAR_RENT,isSigner:false,isWritable:false},
  {pubkey:SystemProgram.programId,isSigner:false,isWritable:false},
];

async function trySim(tx){
  try{
    const sim=await conn.simulateTransaction(tx,{commitment:'confirmed',encoding:'base64',sigVerify:true});
    return {ok: sim.value.err===null, sim};
  }catch(e){
    if(String(e).match(/Invalid arguments/i)) return {ok:null, err:e}; // node rejected sim format
    return {ok:false, err:e};
  }
}

async function run(){
  let chosen=null, last={};
  for(const nm of names){
    for(const enc of encs){
      const data=Buffer.concat([sighash(nm),enc(bps)]);
      const ix=new TransactionInstruction({programId:PROGRAM,keys,data});
      const tx=new Transaction().add(ix);
      tx.feePayer=payer.publicKey;
      const {blockhash}=await conn.getLatestBlockhash('confirmed');
      tx.recentBlockhash=blockhash;
      tx.sign(payer);
      const res=await trySim(tx);
      last=res;
      if(res.ok===true){
        chosen=tx; break;
      }
      if(res.ok===null){
        chosen=tx; break; // sim rejected by node, but tx constructed OK
      }
    }
    if(chosen) break;
  }
  if(!chosen){
    console.log('SIM_OK=false');
    console.log('SIM_LOGS='+JSON.stringify((last.sim&&last.sim.value&&last.sim.value.logs)||[]));
    console.log('SIM_ERR='+String(last.err|| (last.sim&&last.sim.value&&last.sim.value.err)));
    process.exit(1);
  }

  const pre=(await conn.getAccountInfo(POOL))?'POOL_EXISTS':'POOL_FREE';
  console.log('POOL_STATUS='+pre);

  let needSend=true;
  const res=await trySim(chosen);
  if(res.ok===true){
    console.log('SIM_OK=true');
    console.log('SIM_LOGS='+JSON.stringify(res.sim.value.logs||[]));
  }else if(res.ok===false){
    console.log('SIM_OK=false');
    console.log('SIM_ERR='+String(res.err|| (res.sim&&res.sim.value&&res.sim.value.err)));
  }else{
    console.log('SIM_SKIPPED=true');
  }

  const sig=await conn.sendRawTransaction(chosen.serialize(),{skipPreflight:true,maxRetries:3});
  await conn.confirmTransaction(sig,'confirmed');
  console.log('POOL_CREATE_SIG='+sig);
  console.log('EXPLORER=https://explorer.solana.com/tx/'+sig+'?cluster=devnet');
}
run();
