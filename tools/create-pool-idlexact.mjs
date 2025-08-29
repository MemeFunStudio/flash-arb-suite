import fs from 'fs';
import {createHash} from 'crypto';
import {Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction} from '@solana/web3.js';
import {getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID as SPL_TOKEN_PROGRAM_ID} from '@solana/spl-token';

function sighash(n){return createHash('sha256').update(`global:${n}`).digest().slice(0,8);}
function u8(n){const b=Buffer.alloc(1);b.writeUInt8(Number(n));return b;}
function u16(n){const b=Buffer.alloc(2);b.writeUInt16LE(Number(n));return b;}
function u32(n){const b=Buffer.alloc(4);b.writeUInt32LE(Number(n));return b;}
function u64(n){const b=Buffer.alloc(8);let lo=Number(n)>>>0,hi=Math.floor(Number(n)/2**32)>>>0;b.writeUInt32LE(lo,0);b.writeUInt32LE(hi,4);return b;}
function u128(n){let x=BigInt(n);const b=Buffer.alloc(16);b.writeBigUInt64LE(x&((1n<<64n)-1n),0);b.writeBigUInt64LE(x>>64n,8);return b;}
function bool(v){return Buffer.from([v?1:0]);}
function bytes(x){const d=typeof x==='string'?Buffer.from(x,'utf8'):Buffer.from(x);const l=u32(d.length);return Buffer.concat([l,d]);}
function pk(v){return new PublicKey(v).toBuffer();}
function enc(t,v){if(typeof t==='string'){if(t==='u8')return u8(v);if(t==='u16')return u16(v);if(t==='u32')return u32(v);if(t==='u64')return u64(v);if(t==='u128')return u128(v);if(t==='bool')return bool(v===true||v==='true'||v===1);if(t==='string')return bytes(String(v));if(t==='bytes')return bytes(v);if(t==='publicKey')return pk(v);}throw new Error('UNSUPPORTED_TYPE:'+JSON.stringify(t));}
function UP(s){return String(s).replace(/([a-z0-9])([A-Z])/g,'$1_$2').toUpperCase();}

const env=process.env;
const rpc=env.DEVNET_RPC||'https://api.devnet.solana.com';
const conn=new Connection(rpc,'confirmed');
const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(env.SOLANA_KEYPAIR,'utf8'))));

const PROGRAM=new PublicKey(env.PROGRAM);
const GLOBAL=new PublicKey(env.GLOBAL);
const MINT=new PublicKey(env.MINT);
const TOKEN_PROGRAM=new PublicKey(env.TOKEN_PROGRAM||SPL_TOKEN_PROGRAM_ID.toBase58());
const SYSVAR_RENT=new PublicKey(env.SYSVAR_RENT||'SysvarRent111111111111111111111111111111111');

const OWNER=new PublicKey(env.OWNER||payer.publicKey.toBase58());
const [POOL, POOL_BUMP]=PublicKey.findProgramAddressSync([Buffer.from('pool'), MINT.toBuffer(), OWNER.toBuffer()], PROGRAM);
const [VAULT_AUTHORITY]=PublicKey.findProgramAddressSync([Buffer.from('vault_auth'), POOL.toBuffer()], PROGRAM);
const VAULT=await getAssociatedTokenAddress(MINT, VAULT_AUTHORITY, true, TOKEN_PROGRAM, ASSOCIATED_TOKEN_PROGRAM_ID);

const idlPaths=['idl.json','idl/flash_executor.json','target/idl/flash_executor.json'];
let idl=null; for(const p of idlPaths){ if(fs.existsSync(p)){ idl=JSON.parse(fs.readFileSync(p,'utf8')); break; } }
const ixMeta=idl.instructions.find(i=>i.name==='create_pool')||idl.instructions.find(i=>i.name==='createPool');
const disc=sighash(ixMeta.name);

const ensureAta=async()=>{const ai=await conn.getAccountInfo(VAULT);if(!ai){const tx1=new Transaction().add(createAssociatedTokenAccountInstruction(payer.publicKey, VAULT, VAULT_AUTHORITY, MINT, TOKEN_PROGRAM, ASSOCIATED_TOKEN_PROGRAM_ID));tx1.feePayer=payer.publicKey;const {blockhash}=await conn.getLatestBlockhash('confirmed');tx1.recentBlockhash=blockhash;tx1.sign(payer);const s=await conn.sendRawTransaction(tx1.serialize(),{skipPreflight:true,maxRetries:3});await conn.confirmTransaction(s,'confirmed');console.log('ATA_CREATE_SIG='+s);console.log('ATA_EXPLORER=https://explorer.solana.com/tx/'+s+'?cluster=devnet');}};
await ensureAta();

function mapAccountName(n){
  const s=n.toLowerCase();
  if(s.includes('global')) return GLOBAL;
  if(s==='pool') return POOL;
  if(s.includes('vault_authority')) return VAULT_AUTHORITY;
  if(s==='vault') return VAULT;
  if(s.includes('mint')) return MINT;
  if(s.includes('token') && s.includes('program')) return TOKEN_PROGRAM;
  if(s.includes('system') && s.includes('program')) return SystemProgram.programId;
  if(s.includes('rent')) return SYSVAR_RENT;
  if(s==='owner' || s.includes('payer') || (s==='authority' && !s.includes('vault'))) return OWNER;
  throw new Error('UNMAPPED_ACCOUNT:'+n);
}

const keys = ixMeta.accounts.map(a=>{
  const pubkey = mapAccountName(a.name);
  return {pubkey, isSigner: !!a.isSigner, isWritable: !!a.isMut};
});

const argBufs=[]; 
for(const a of (ixMeta.args||[])){
  const key=UP(a.name);
  let val=env[key];
  if(val===undefined && /profit/i.test(a.name)) val=env.MIN_PROFIT_BPS;
  if(val===undefined && /pool.*bump/i.test(a.name)) val=String(POOL_BUMP);
  if(val===undefined && /mint/i.test(a.name)) val=env.MINT;
  if(val===undefined) throw new Error('MISSING_ARG:'+a.name);
  argBufs.push(enc(a.type,val));
}
const data=Buffer.concat([disc,...argBufs]);
const ix=new TransactionInstruction({programId:PROGRAM,keys,data});
const tx=new Transaction().add(ix);
tx.feePayer=payer.publicKey;
const {blockhash}=await conn.getLatestBlockhash('confirmed'); tx.recentBlockhash=blockhash; tx.sign(payer);
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
