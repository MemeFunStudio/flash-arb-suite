import fs from 'fs';
import {PublicKey} from '@solana/web3.js';

function U(s){return String(s).replace(/([a-z0-9])([A-Z])/g,'$1_$2').toUpperCase();}
const env=process.env;
const PROGRAM=new PublicKey(env.PROGRAM);

const idlPaths=['idl.json','idl/flash_executor.json','target/idl/flash_executor.json'];
let idl=null, path=null;
for(const p of idlPaths){ if(fs.existsSync(p)){ idl=JSON.parse(fs.readFileSync(p,'utf8')); path=p; break; } }
if(!idl) throw new Error('IDL_NOT_FOUND');

const ix = idl.instructions.find(i=>i.name==='create_pool') || idl.instructions.find(i=>i.name==='createPool');
if(!ix) throw new Error('CREATE_POOL_NOT_IN_IDL');

const poolAcc = ix.accounts.find(a=>a.name==='pool' || a.name==='Pool');
if(!poolAcc || !poolAcc.pda || !poolAcc.pda.seeds) throw new Error('IDL_HAS_NO_PDA_SEEDS_FOR_POOL');

function mapAccountVal(name){
  const P=U(name);
  const dict={
    OWNER: env.OWNER,
    AUTHORITY: env.OWNER || env.AUTHORITY,
    GLOBAL: env.GLOBAL,
    POOL: env.POOL,
    VAULT_AUTHORITY: env.VAULT_AUTHORITY,
    VAULT: env.VAULT,
    MINT: env.MINT,
    TOKEN_PROGRAM: env.TOKEN_PROGRAM,
    SYSTEM_PROGRAM: env.SYSTEM_PROGRAM || '11111111111111111111111111111111',
    SYSVAR_RENT: env.SYSVAR_RENT || 'SysvarRent111111111111111111111111111111111'
  };
  if (dict[P]) return new PublicKey(dict[P]).toBuffer();
  if (/owner|authority/i.test(name)) return new PublicKey(dict.OWNER || dict.AUTHORITY).toBuffer();
  if (/global/i.test(name)) return new PublicKey(dict.GLOBAL).toBuffer();
  if (/^pool$/i.test(name) && dict.POOL) return new PublicKey(dict.POOL).toBuffer();
  if (/vault.*authority/i.test(name)) return new PublicKey(dict.VAULT_AUTHORITY).toBuffer();
  if (/^vault$/i.test(name)) return new PublicKey(dict.VAULT).toBuffer();
  if (/mint/i.test(name)) return new PublicKey(dict.MINT).toBuffer();
  if (/token.?program/i.test(name)) return new PublicKey(dict.TOKEN_PROGRAM).toBuffer();
  if (/system.?program/i.test(name)) return new PublicKey(dict.SYSTEM_PROGRAM).toBuffer();
  if (/rent/i.test(name)) return new PublicKey(dict.SYSVAR_RENT).toBuffer();
  throw new Error('MISSING_ACCOUNT_FOR_SEED:'+name);
}

function constBuf(type,value){
  if (Array.isArray(value)) return Buffer.from(value);              // e.g. [112,111,111,108]
  if (typeof value === 'string') return Buffer.from(value);         // e.g. "pool"
  // fallbacks for typed consts
  if (type === 'bytes') return Buffer.isBuffer(value)?value:Buffer.from(value);
  if (type === 'publicKey') return new PublicKey(value).toBuffer();
  try { return Buffer.from(value); } catch { throw new Error('CONST_SEED_UNSUPPORTED'); }
}

const seedBufs=[];
const seedInfo=[];
for (const s of poolAcc.pda.seeds){
  if (s.kind === 'const'){
    const b = constBuf(s.type, s.value);
    seedBufs.push(b);
    seedInfo.push({kind:'const', len:b.length, preview:b.toString('utf8')});
  } else if (s.kind === 'account'){
    const b = mapAccountVal(s.path || s.name);
    seedBufs.push(b);
    seedInfo.push({kind:'account', name:(s.path||s.name), base58:new PublicKey(b).toBase58()});
  } else if (s.kind === 'programId'){
    const b = new PublicKey(env.PROGRAM).toBuffer();
    seedBufs.push(b);
    seedInfo.push({kind:'programId', base58:new PublicKey(b).toBase58()});
  } else if (s.kind === 'arg'){
    throw new Error('SEED_ARG_VALUE_REQUIRED:'+ (s.path||s.name));  // if this fires, we’ll bind env for that arg
  } else {
    throw new Error('UNSUPPORTED_SEED_KIND:'+JSON.stringify(s));
  }
}

const [pda,bump] = PublicKey.findProgramAddressSync(seedBufs, PROGRAM);
console.log('IDL_PATH='+path);
console.log('SEEDS='+JSON.stringify(seedInfo));
console.log('DERIVED_POOL='+pda.toBase58());
console.log('POOL_BUMP='+bump);
