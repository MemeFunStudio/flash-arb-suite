import fs from 'fs';
import {PublicKey} from '@solana/web3.js';
function U(s){return String(s).replace(/([a-z0-9])([A-Z])/g,'$1_$2').toUpperCase();}
const env=process.env;
const PROGRAM=new PublicKey(env.PROGRAM);
const target=(process.argv[2]||'').toLowerCase();
const idlPaths=['idl.json','idl/flash_executor.json','target/idl/flash_executor.json'];
let idl=null; for(const p of idlPaths){ if(fs.existsSync(p)){ idl=JSON.parse(fs.readFileSync(p,'utf8')); break; } }
if(!idl) throw new Error('IDL_NOT_FOUND');
const ix=idl.instructions.find(i=>['create_pool','createPool'].includes(i.name));
if(!ix) throw new Error('INSTR_NOT_FOUND');
const acc=(ix.accounts||[]).find(a=>a.name.toLowerCase()===target);
if(!acc) throw new Error('ACCOUNT_NOT_FOUND:'+target);
if(!acc.pda||!acc.pda.seeds) throw new Error('ACCOUNT_HAS_NO_PDA:'+target);
function mapAccountVal(n){
  const P=U(n);
  const d={OWNER:env.OWNER,AUTHORITY:env.OWNER||env.AUTHORITY,GLOBAL:env.GLOBAL,POOL:env.POOL,VAULT_AUTHORITY:env.VAULT_AUTHORITY,VAULT:env.VAULT,MINT:env.MINT,TOKEN_PROGRAM:env.TOKEN_PROGRAM,SYSTEM_PROGRAM:env.SYSTEM_PROGRAM||'11111111111111111111111111111111',SYSVAR_RENT:env.SYSVAR_RENT||'SysvarRent111111111111111111111111111111111'};
  if(d[P]) return new PublicKey(d[P]).toBuffer();
  if(/owner|authority/i.test(n)) return new PublicKey(d.OWNER||d.AUTHORITY).toBuffer();
  if(/global/i.test(n)) return new PublicKey(d.GLOBAL).toBuffer();
  if(/^pool$/i.test(n) && d.POOL) return new PublicKey(d.POOL).toBuffer();
  if(/vault.*authority/i.test(n)) return new PublicKey(d.VAULT_AUTHORITY).toBuffer();
  if(/^vault$/i.test(n)) return new PublicKey(d.VAULT).toBuffer();
  if(/mint/i.test(n)) return new PublicKey(d.MINT).toBuffer();
  if(/token.?program/i.test(n)) return new PublicKey(d.TOKEN_PROGRAM).toBuffer();
  if(/system.?program/i.test(n)) return new PublicKey(d.SYSTEM_PROGRAM).toBuffer();
  if(/rent/i.test(n)) return new PublicKey(d.SYSVAR_RENT).toBuffer();
  throw new Error('MISSING_ACCOUNT_FOR_SEED:'+n);
}
function constBuf(type,value){
  if(Array.isArray(value)) return Buffer.from(value);
  if(typeof value==='string') return Buffer.from(value);
  if(type==='publicKey') return new PublicKey(value).toBuffer();
  try{return Buffer.from(value);}catch{throw new Error('CONST_UNSUPPORTED');}
}
let seeds=[];
for(const s of acc.pda.seeds){
  if(s.kind==='const') seeds.push(constBuf(s.type,s.value));
  else if(s.kind==='account') seeds.push(mapAccountVal(s.path||s.name));
  else if(s.kind==='programId') seeds.push(new PublicKey(env.PROGRAM).toBuffer());
  else if(s.kind==='arg') throw new Error('SEED_ARG_VALUE_REQUIRED:'+(s.path||s.name));
  else throw new Error('UNSUPPORTED_SEED_KIND');
}
const [pda,bump]=PublicKey.findProgramAddressSync(seeds,PROGRAM);
console.log('ACCOUNT='+target);
console.log('DERIVED='+pda.toBase58());
console.log('BUMP='+bump);
