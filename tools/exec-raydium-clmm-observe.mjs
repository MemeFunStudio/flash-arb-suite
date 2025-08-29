import fs from 'fs';
import {createHash} from 'crypto';
import {Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction} from '@solana/web3.js';

const e=process.env;
const conn=new Connection(e.DEVNET_RPC||'https://api.devnet.solana.com','confirmed');
if(!e.SOLANA_KEYPAIR) throw new Error('MISSING_SOLANA_KEYPAIR');
const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(e.SOLANA_KEYPAIR,'utf8'))));

const PROGRAM=new PublicKey(e.PROGRAM);
const GLOBAL=new PublicKey(e.GLOBAL);
const POOL=new PublicKey(e.WSOL_POOL||e.POOL);
const VAULT_AUTH=new PublicKey(e.WSOL_VAULT_AUTHORITY||e.VAULT_AUTHORITY);
const VAULT=new PublicKey(e.WSOL_VAULT||e.VAULT);
const TOKEN_PROG=new PublicKey(e.TOKEN_PROGRAM||'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const CALLER=payer.publicKey;

const CLMM_PROG=new PublicKey('DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH');

const idl=JSON.parse(fs.readFileSync('idl.raydium_clmm.json','utf8'));
function findIx(names){for(const n of names){const ix=idl.instructions.find(i=>i.name.toLowerCase()===n.toLowerCase());if(ix)return {ix,name:n};}return null;}
const cand=findIx(['observe','update_observation','observe_swap','simulate_swap']);
if(!cand) throw new Error('NO_OBSERVE_IX_IN_IDL');
const OBS_NAME=cand.name;

function sh(n){return createHash('sha256').update(`global:${n}`).digest().slice(0,8);}
function u8(n){return Buffer.from([n&255]);}
function u32(n){const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;}
function u64(n){const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;}
function vecU8(buf){return Buffer.concat([u32(buf.length),buf]);}
function vec(items){return Buffer.concat([u32(items.length),Buffer.concat(items)]);}

async function firstClmmPool(){
  const list=await conn.getProgramAccounts(CLMM_PROG,{commitment:'confirmed',dataSlice:{offset:0,length:0}});
  if(!list.length) throw new Error('NO_CLMM_ACCOUNTS');
  return list[0].pubkey;
}

const CLMM_POOL=new PublicKey(e.CLMM_POOL_CANDIDATE|| (await firstClmmPool()));
function pda(seedLabel,base){return PublicKey.findProgramAddressSync([Buffer.from(seedLabel),base.toBuffer()],CLMM_PROG);}
const tryPdas=[()=>pda('observation',CLMM_POOL),()=>pda('observation_state',CLMM_POOL),()=>pda('oracle',CLMM_POOL)];

function buildClmmData(variant){
  if(variant===0){return sh(OBS_NAME);}
  if(variant===1){const v=Buffer.concat([sh(OBS_NAME),vec(Buffer.from([u32(1),u32(1)]))]);return v;}
  return sh(OBS_NAME);
}

function serMeta(pk,isSigner,isWritable){return Buffer.concat([pk.toBuffer(),u8(isSigner?1:0),u8(isWritable?1:0)])}
function serInstr(prog,metas,data){return Buffer.concat([prog.toBuffer(),vec(metas.map(m=>serMeta(m.pubkey,m.isSigner,m.isWritable))),vecU8(data)])}

function execIx(routeInstrs){
  const data=Buffer.concat([sh('execute_route'),u64(0),vec(routeInstrs)]);
  const keys=[
    {pubkey:GLOBAL,isSigner:false,isWritable:false},
    {pubkey:POOL,isSigner:false,isWritable:false},
    {pubkey:VAULT_AUTH,isSigner:false,isWritable:false},
    {pubkey:VAULT,isSigner:false,isWritable:false},
    {pubkey:CALLER,isSigner:false,isWritable:false},
    {pubkey:TOKEN_PROG,isSigner:false,isWritable:false},
  ];
  return new TransactionInstruction({programId:PROGRAM,keys,data});
}

function remAccount(pk,isSigner=false,isWritable=false){return {pubkey:pk,isSigner,isWritable}}

async function attempt(){
  const rem=[remAccount(CLMM_PROG,false,false),remAccount(GLOBAL),remAccount(POOL),remAccount(VAULT),remAccount(VAULT_AUTH),remAccount(CALLER),remAccount(TOKEN_PROG)];
  const clmmAccounts=cand.ix.accounts.map(a=>({name:a.name,isMut:!!a.isMut,isSigner:!!a.isSigner}));
  let obs=null;
  for(const get of tryPdas){try{const [addr]=get();obs=addr;break;}catch{}}
  const mapping=(name)=>{
    const n=name.toLowerCase();
    if(n.includes('pool')) return CLMM_POOL;
    if(n.includes('observation')) return obs;
    if(n.includes('token_program')) return TOKEN_PROG;
    if(n.includes('system_program')) return SystemProgram.programId;
    if(n==='rent' || n.includes('rent')) return new PublicKey('SysvarRent111111111111111111111111111111111');
    if(n.includes('clock')) return new PublicKey('SysvarC1ock11111111111111111111111111111111'.replace('1o','lo')); // guard
    return null;
  };
  const metas=[];
  for(const a of clmmAccounts){
    const pk=mapping(a.name);
    if(!pk) return {ok:false,reason:'UNMAPPED_ACCOUNT:'+a.name};
    rem.push(remAccount(pk,false,!!a.isMut));
    metas.push({pubkey:pk,isSigner:false,isWritable:!!a.isMut});
  }
  for(const variant of [0,1]){
    const clmmData=buildClmmData(variant);
    const clmmSer=serInstr(CLMM_PROG,metas,clmmData);
    const ix=execIx([clmmSer]);
    const tx=new Transaction().add(ix);
    tx.feePayer=payer.publicKey;
    tx.recentBlockhash=(await conn.getLatestBlockhash('confirmed')).blockhash;
    tx.sign(payer);
    try{
      const sim=await conn.simulateTransaction(tx,{sigVerify:true,replaceRecentBlockhash:true,accounts:{encoding:'base64',addresses:rem.map(r=>r.pubkey.toBase58())}});
      if(sim.value.err) continue;
      const sig=await conn.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:3});
      await conn.confirmTransaction(sig,'confirmed');
      return {ok:true,sig,variant,obs:obs?.toBase58()};
    }catch(e){}
  }
  return {ok:false,reason:'ALL_VARIANTS_FAILED'};
}

attempt().then(r=>{
  if(!r.ok){console.log('RAYDIUM_EXECUTE_FAILED='+r.reason);process.exit(1)}
  console.log('CLMM_POOL='+CLMM_POOL.toBase58());
  console.log('CLMM_OBSERVATION='+r.obs);
  console.log('RAYDIUM_EXECUTE_SIG='+r.sig);
  console.log('EXPLORER=https://explorer.solana.com/tx/'+r.sig+'?cluster=devnet');
}).catch(e=>{console.log('RAYDIUM_EXECUTE_EXCEPTION='+e);process.exit(1)});
