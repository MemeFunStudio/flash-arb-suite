import fs from 'fs';
import {createHash} from 'crypto';
import {Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction} from '@solana/web3.js';
import {getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID as SPL_TOKEN_PROGRAM_ID} from '@solana/spl-token';

function sighash(n){return createHash('sha256').update(`global:${n}`).digest().slice(0,8);}
function u8(n){return Buffer.from([Number(n)&255]);}
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
const OWNER=new PublicKey(env.OWNER);
const TOKEN_PROGRAM=new PublicKey(env.TOKEN_PROGRAM||SPL_TOKEN_PROGRAM_ID.toBase58());

const idlPaths=['idl.json','idl/flash_executor.json','target/idl/flash_executor.json'];
let idl=null; for(const p of idlPaths){ if(fs.existsSync(p)){ idl=JSON.parse(fs.readFileSync(p,'utf8')); break; } }
if(!idl) { console.log('FAIL=IDL_NOT_FOUND'); process.exit(1); }

const ixMeta=idl.instructions.find(i=>i.name==='create_pool')||idl.instructions.find(i=>i.name==='createPool');
if(!ixMeta){ console.log('FAIL=INSTR_NOT_FOUND'); process.exit(1); }

const disc=sighash(ixMeta.name);
const [POOL, POOL_BUMP]=PublicKey.findProgramAddressSync([Buffer.from('pool'), MINT.toBuffer(), OWNER.toBuffer()], PROGRAM);

const candidates=[
  ['vault+POOL', PublicKey.findProgramAddressSync([Buffer.from('vault'), POOL.toBuffer()], PROGRAM)[0]],
  ['vault+POOL+MINT', PublicKey.findProgramAddressSync([Buffer.from('vault'), POOL.toBuffer(), MINT.toBuffer()], PROGRAM)[0]],
  ['vault+MINT+OWNER', PublicKey.findProgramAddressSync([Buffer.from('vault'), MINT.toBuffer(), OWNER.toBuffer()], PROGRAM)[0]],
  ['vault_authority+POOL', PublicKey.findProgramAddressSync([Buffer.from('vault_authority'), POOL.toBuffer()], PROGRAM)[0]],
  ['vault+GLOBAL+MINT', PublicKey.findProgramAddressSync([Buffer.from('vault'), GLOBAL.toBuffer(), MINT.toBuffer()], PROGRAM)[0]],
  ['vault+GLOBAL+POOL', PublicKey.findProgramAddressSync([Buffer.from('vault'), GLOBAL.toBuffer(), POOL.toBuffer()], PROGRAM)[0]],
];

function mapArgVal(a){
  const key=UP(a.name);
  let val=env[key];
  if(val===undefined && /profit/i.test(a.name)) val=env.MIN_PROFIT_BPS;
  if(val===undefined && /pool.*bump/i.test(a.name)) val=String(POOL_BUMP);
  if(val===undefined && /pool.*id/i.test(a.name)) val=env.POOL_ID;
  if(val===undefined && /mint/i.test(a.name)) val=env.MINT;
  if(val===undefined) throw new Error('MISSING_ARG:'+a.name);
  return enc(a.type,val);
}

function keysFor(vaultAuth, vault){
  const mapName=(n)=>{
    const P=UP(n);
    if(P==='OWNER'||/owner|authority/i.test(n)) return OWNER;
    if(P==='GLOBAL'||/global/i.test(n)) return GLOBAL;
    if(P==='POOL'||/^pool$/i.test(n)) return POOL;
    if(/vault.*authority/i.test(n)) return vaultAuth;
    if(/^vault$/i.test(n)) return vault;
    if(/mint/i.test(n)) return MINT;
    if(/token.?program/i.test(n)) return TOKEN_PROGRAM;
    if(/system.?program/i.test(n)) return SystemProgram.programId;
    if(/rent/i.test(n)) return new PublicKey(env.SYSVAR_RENT||'SysvarRent111111111111111111111111111111111');
    throw new Error('MISSING_ACCOUNT:'+n);
  };
  return (ixMeta.accounts||[]).map(ac=>{
    const pk = mapName(ac.name);
    const nameLower = String(ac.name).toLowerCase();
    const isSigner = Boolean(ac.isSigner) || /owner|authority/.test(nameLower);
    const isWritable = Boolean(ac.isMut) || /pool|global|vault|vault_authority/.test(nameLower);
    return {pubkey:pk,isSigner,isWritable};
  });
}

async function tryOne(label, vaPk){
  const ata = await getAssociatedTokenAddress(MINT, vaPk, true, TOKEN_PROGRAM, ASSOCIATED_TOKEN_PROGRAM_ID);
  const ai = await conn.getAccountInfo(ata);
  if(!ai){
    const tx1=new Transaction().add(
      createAssociatedTokenAccountInstruction(payer.publicKey, ata, vaPk, MINT, TOKEN_PROGRAM, ASSOCIATED_TOKEN_PROGRAM_ID)
    );
    tx1.feePayer=payer.publicKey;
    const {blockhash}=await conn.getLatestBlockhash('confirmed'); tx1.recentBlockhash=blockhash; tx1.sign(payer);
    const sig1=await conn.sendRawTransaction(tx1.serialize(),{skipPreflight:true,maxRetries:3}); await conn.confirmTransaction(sig1,'confirmed');
    console.log('ATA_CREATE_SIG='+sig1);
    console.log('ATA_EXPLORER=https://explorer.solana.com/tx/'+sig1+'?cluster=devnet');
  }
  let argBufs=[]; for(const a of (ixMeta.args||[])) argBufs.push(mapArgVal(a));
  const data=Buffer.concat([disc,...argBufs]);
  const keys=keysFor(vaPk, ata);
  const ix=new TransactionInstruction({programId:PROGRAM,keys,data});
  const tx=new Transaction().add(ix);
  tx.feePayer=payer.publicKey;
  const {blockhash}=await conn.getLatestBlockhash('confirmed'); tx.recentBlockhash=blockhash; tx.sign(payer);
  const sig=await conn.sendRawTransaction(tx.serialize(),{skipPreflight:true,maxRetries:3});
  await conn.confirmTransaction(sig,'confirmed');
  const poolInfo=await conn.getAccountInfo(POOL);
  const ok = !!(poolInfo && poolInfo.owner.equals(PROGRAM) && poolInfo.data && poolInfo.data.length>0);
  console.log('TRY_LABEL='+label);
  console.log('VAULT_AUTHORITY='+vaPk.toBase58());
  console.log('VAULT='+ata.toBase58());
  console.log('POOL_CREATE_SIG='+sig);
  console.log('EXPLORER=https://explorer.solana.com/tx/'+sig+'?cluster=devnet');
  console.log('POOL_OWNER='+(poolInfo?poolInfo.owner.toBase58():''));
  console.log('POOL_DATALEN='+(poolInfo?poolInfo.data.length:0));
  console.log('POOL_OK='+(ok?'YES':'NO'));
  return ok;
}

(async()=>{
  for(const [label,addr] of candidates){
    const ok=await tryOne(label, addr);
    if(ok){ console.log('WIN_LABEL='+label); process.exit(0); }
  }
  console.log('ALL_TRIES_FAILED');
  process.exit(2);
})();
