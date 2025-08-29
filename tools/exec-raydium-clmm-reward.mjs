import fs from 'fs';
import {createHash} from 'crypto';
import {Connection,Keypair,PublicKey,Transaction,TransactionInstruction} from '@solana/web3.js';

const e=process.env;
function need(k){const v=e[k];if(!v||!v.trim()){console.log('MISSING_ENV='+k);process.exit(1)}return v.trim()}
const PROGRAM=new PublicKey(need('PROGRAM'));
const GLOBAL=new PublicKey(need('GLOBAL'));
const POOL=new PublicKey(need('POOL'));
const VAULT_AUTHORITY=new PublicKey(need('VAULT_AUTHORITY'));
const VAULT=new PublicKey(need('VAULT'));
const TOKEN_PROGRAM=new PublicKey(e.TOKEN_PROGRAM||'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const CLMM_PROG=new PublicKey(need('RAYDIUM_CLMM'));
const CLMM_POOL=new PublicKey(need('CLMM_POOL'));
const SKP=need('SOLANA_KEYPAIR');

const conn=new Connection(e.DEVNET_RPC||'https://api.devnet.solana.com','confirmed');
const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(SKP,'utf8'))));

function sh(n){return createHash('sha256').update('global:'+n).digest().slice(0,8)}
function u8(n){return Buffer.from([n&255])}
function u32(n){const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b}
function u64(n){const b=Buffer.alloc(8);b.writeBigUInt64LE(0n);return b}
function vecU8(buf){return Buffer.concat([u32(buf.length),buf])}
function serMeta(pk,isSigner,isWritable){return Buffer.concat([pk.toBuffer(),u8(isSigner?1:0),u8(isWritable?1:0)])}
function serInstr(prog,metas,data){return Buffer.concat([prog.toBuffer(),u32(metas.length),Buffer.concat(metas.map(m=>serMeta(m.pubkey,m.isSigner,m.isWritable))),vecU8(data)])}

function execIx(routeInstrs,rem){
  const keys=[
    {pubkey:GLOBAL,isSigner:false,isWritable:false},
    {pubkey:POOL,isSigner:false,isWritable:false},
    {pubkey:VAULT_AUTHORITY,isSigner:false,isWritable:false},
    {pubkey:VAULT,isSigner:false,isWritable:true},
    {pubkey:payer.publicKey,isSigner:false,isWritable:false},
    {pubkey:TOKEN_PROGRAM,isSigner:false,isWritable:false},
    ...rem
  ];
  const data=Buffer.concat([sh('execute_route'),u64(0),u32(routeInstrs.length),Buffer.concat(routeInstrs)]);
  return new TransactionInstruction({programId:PROGRAM,keys,data});
}

(async()=>{
  const remCanon=[
    {pubkey:GLOBAL,isSigner:false,isWritable:false},
    {pubkey:POOL,isSigner:false,isWritable:false},
    {pubkey:VAULT,isSigner:false,isWritable:true},
    {pubkey:VAULT_AUTHORITY,isSigner:false,isWritable:false},
    {pubkey:payer.publicKey,isSigner:false,isWritable:false},
    {pubkey:TOKEN_PROGRAM,isSigner:false,isWritable:false},
  ];
  const remClmm=[
    {pubkey:CLMM_PROG,isSigner:false,isWritable:false},
    {pubkey:CLMM_POOL,isSigner:false,isWritable:true},
  ];
  const clmmMetas=[{pubkey:CLMM_POOL,isSigner:false,isWritable:true}];

  const names=['update_reward_infos','updateRewardInfos'];
  for(const nm of names){
    const clmmData=sh(nm);
    const clmmSer=serInstr(CLMM_PROG,clmmMetas,clmmData);
    const ix=execIx([clmmSer],[...remCanon,...remClmm]);
    const tx=new Transaction().add(ix);
    tx.feePayer=payer.publicKey;
    tx.recentBlockhash=(await conn.getLatestBlockhash('confirmed')).blockhash;
    tx.sign(payer);
    try{
      const sim=await conn.simulateTransaction(tx,{sigVerify:true,replaceRecentBlockhash:true});
      if(sim.value.err){continue}
      const sig=await conn.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:3});
      await conn.confirmTransaction(sig,'confirmed');
      console.log('CLMM_POOL='+CLMM_POOL.toBase58());
      console.log('RAYDIUM_EXECUTE_SIG='+sig);
      console.log('EXPLORER=https://explorer.solana.com/tx/'+sig+'?cluster=devnet');
      process.exit(0);
    }catch(e){}
  }
  console.log('RAYDIUM_EXECUTE_FAILED=all_variants_failed');
  process.exit(1);
})().catch(e=>{console.log('RAYDIUM_EXECUTE_EXCEPTION='+e);process.exit(1)});
