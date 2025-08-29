import fs from 'fs';
import {createHash} from 'crypto';
import {Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction} from '@solana/web3.js';

function sighash(n){return createHash('sha256').update(`global:${n}`).digest().slice(0,8);}
function u8(n){return Buffer.from([Number(n)&0xff]);}
function u16(n){const b=Buffer.alloc(2);b.writeUInt16LE(Number(n));return b;}
function u32(n){const b=Buffer.alloc(4);b.writeUInt32LE(Number(n));return b;}
function u64(n){const b=Buffer.alloc(8);let lo=Number(n)>>>0,hi=Math.floor(Number(n)/2**32)>>>0;b.writeUInt32LE(lo,0);b.writeUInt32LE(hi,4);return b;}
function u128(n){let x=BigInt(n);const b=Buffer.alloc(16);b.writeBigUInt64LE(x&((1n<<64n)-1n),0);b.writeBigUInt64LE(x>>64n,8);return b;}
function bool(v){return Buffer.from([v?1:0]);}
function bytes(x){const d=typeof x==='string'?Buffer.from(x,'utf8'):Buffer.from(x);const l=u32(d.length);return Buffer.concat([l,d]);}
function pubkey(v){return new PublicKey(v).toBuffer();}
function encodeType(t,v){if(typeof t==='string'){if(t==='u8')return u8(v);if(t==='u16')return u16(v);if(t==='u32')return u32(v);if(t==='u64')return u64(v);if(t==='u128')return u128(v);if(t==='bool')return bool(v===true||v==='true'||v===1);if(t==='string')return bytes(String(v));if(t==='bytes')return bytes(v);if(t==='publicKey')return pubkey(v);}throw new Error('UNSUPPORTED_TYPE:'+JSON.stringify(t));}
function upcase(name){return String(name).replace(/([a-z0-9])([A-Z])/g,'$1_$2').toUpperCase();}

const env=process.env;
const rpc=env.DEVNET_RPC||'https://api.devnet.solana.com';
const conn=new Connection(rpc,'confirmed');
const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(env.SOLANA_KEYPAIR,'utf8'))));

const idlPaths=['idl.json','idl/flash_executor.json','target/idl/flash_executor.json'];
let idl=null;
for(const p of idlPaths){if(fs.existsSync(p)){idl=JSON.parse(fs.readFileSync(p,'utf8'));break;}}
if(!idl) throw new Error('IDL_NOT_FOUND');

let ixMeta=idl.instructions.find(i=>i.name==='create_pool')||idl.instructions.find(i=>i.name==='createPool')||null;
if(!ixMeta) throw new Error('INSTR_NOT_FOUND');

const progId=new PublicKey(env.PROGRAM);
const disc=sighash(ixMeta.name);

let argBufs=[];
let missingArgs=[];
for(const a of (ixMeta.args||[])){
  const key=upcase(a.name);
  let val=env[key];
  if(val===undefined){
    if(/profit/i.test(a.name) && env.MIN_PROFIT_BPS!==undefined) val=env.MIN_PROFIT_BPS;
    if(/pool.*id/i.test(a.name) && env.POOL_ID!==undefined) val=env.POOL_ID;
    if(/mint/i.test(a.name) && env.MINT!==undefined) val=env.MINT;
    if(/treasury|vault.*auth/i.test(a.name) && env.VAULT_AUTHORITY!==undefined) val=env.VAULT_AUTHORITY;
  }
  if(val===undefined){missingArgs.push({name:a.name,type:a.type});continue;}
  argBufs.push(encodeType(a.type,val));
}
if(missingArgs.length){console.log('MISSING_ARGS='+JSON.stringify(missingArgs));process.exit(2);}

function mapPk(n){
  const P=upcase(n);
  const dict={
    OWNER:env.OWNER,
    AUTHORITY:env.OWNER||env.AUTHORITY,
    GLOBAL:env.GLOBAL,
    POOL:env.POOL,
    VAULT_AUTHORITY:env.VAULT_AUTHORITY,
    VAULT:env.VAULT,
    MINT:env.MINT,
    TOKEN_PROGRAM:env.TOKEN_PROGRAM||'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    SYSTEM_PROGRAM:env.SYSTEM_PROGRAM||SystemProgram.programId.toBase58(),
    SYSVAR_RENT:env.SYSVAR_RENT||'SysvarRent111111111111111111111111111111111'
  };
  let val=dict[P];
  if(!val){
    if(/owner|authority/i.test(n)) val=dict.OWNER||dict.AUTHORITY;
    else if(/token.?program/i.test(n)) val=dict.TOKEN_PROGRAM;
    else if(/system.?program/i.test(n)) val=dict.SYSTEM_PROGRAM;
    else if(/rent/i.test(n)) val=dict.SYSVAR_RENT;
    else if(/global/i.test(n)) val=dict.GLOBAL;
    else if(/^pool$/i.test(n)) val=dict.POOL;
    else if(/vault.*authority/i.test(n)) val=dict.VAULT_AUTHORITY;
    else if(/^vault$/i.test(n)) val=dict.VAULT;
    else if(/mint/i.test(n)) val=dict.MINT;
  }
  if(!val) throw new Error('MISSING_ENV_FOR_ACCOUNT:'+n);
  return new PublicKey(val);
}

// force correct signer/writable flags regardless of stale IDL
const FORCE_SIGN = new Set(['owner','authority']);
const FORCE_WRITE = new Set(['pool','global','vault','vault_authority','vaultauthority']);

const keys=(ixMeta.accounts||[]).map(ac=>{
  const name=String(ac.name);
  const pk=mapPk(name);
  const isSigner = Boolean(ac.isSigner) || FORCE_SIGN.has(name.toLowerCase());
  const isWritable = Boolean(ac.isMut) || FORCE_WRITE.has(name.toLowerCase());
  return {pubkey:pk,isSigner,isWritable};
});

const data=Buffer.concat([disc,...argBufs]);
const ix=new TransactionInstruction({programId:progId,keys,data});
const tx=new Transaction().add(ix);
tx.feePayer=payer.publicKey;
const {blockhash}=await conn.getLatestBlockhash('confirmed');
tx.recentBlockhash=blockhash;
tx.sign(payer);

try{
  const sim=await conn.simulateTransaction(tx,{commitment:'confirmed',encoding:'base64',sigVerify:true});
  console.log('SIM_OK='+(sim.value.err===null));
  if(sim.value.err){console.log('SIM_ERR='+JSON.stringify(sim.value.err));console.log('SIM_LOGS='+JSON.stringify(sim.value.logs||[]));}
}catch(e){
  console.log('SIM_SKIPPED_DUE_TO='+String(e));
}

const sig=await conn.sendRawTransaction(tx.serialize(),{skipPreflight:true,maxRetries:3});
await conn.confirmTransaction(sig,'confirmed');
console.log('POOL_CREATE_SIG='+sig);
console.log('EXPLORER=https://explorer.solana.com/tx/'+sig+'?cluster=devnet');
