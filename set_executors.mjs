import { readFileSync } from 'fs';
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

const RPC_URL = 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey('9ckBy54vd9G6FmR63Z4PoLtNq8rbtoYzhVbJGx458Kmn');
const IDL_PATH = 'idl/flash_executor.json';
const KEYPAIR_PATH = 'phantom-owner.json';   // owner signer
const GLOBAL_KEYPAIR_PATH = 'global.json';   // to read its pubkey only
const INSTRUCTION_NAME = 'set_executor';

// ---- flexible key utils (same as before) ----
function tryDecodeStringKey(str){ if(!str||typeof str!=='string') return null; const s=str.trim();
  try{const b=bs58.decode(s); if(b.length===32||b.length===64) return new Uint8Array(b);}catch{}
  try{const b=Buffer.from(s,'base64'); if(b.length===32||b.length===64) return new Uint8Array(b);}catch{}
  try{const hh=s.startsWith('0x')?s.slice(2):s; const b=Buffer.from(hh,'hex'); if(b.length===32||b.length===64) return new Uint8Array(b);}catch{}
  return null;
}
function pickBytesFromObject(o){
  for(const k of ['secretKey','privateKey','sk','key','ed25519']) if(Array.isArray(o?.[k])) return Uint8Array.from(o[k]);
  for(const k of ['secretKey','privateKey','sk','key','ed25519','private_key','pk','seed']){ const b=tryDecodeStringKey(o?.[k]); if(b) return b; }
  for(const [k,v] of Object.entries(o||{})){
    if(typeof v==='string'){ const b=tryDecodeStringKey(v); if(b) return b; }
    if(Array.isArray(v)){ const a=Uint8Array.from(v); if(a.length===32||a.length===64) return a; }
    if(v&&typeof v==='object') for(const [kk,vv] of Object.entries(v)){
      if(typeof vv==='string'){ const b=tryDecodeStringKey(vv); if(b) return b; }
      if(Array.isArray(vv)){ const a=Uint8Array.from(vv); if(a.length===32||a.length===64) return a; }
    }
  }
  return null;
}
function keypairFromAny(any){
  let bytes=null;
  if(typeof any==='string') bytes=tryDecodeStringKey(any);
  else if(Array.isArray(any)) bytes=Uint8Array.from(any);
  else if(any&&typeof any==='object') bytes=pickBytesFromObject(any);
  if(!bytes) throw new Error('Unrecognized key file format.');
  if(bytes.length===64) return Keypair.fromSecretKey(bytes);
  if(bytes.length===32){ const kp=nacl.sign.keyPair.fromSeed(bytes); return Keypair.fromSecretKey(kp.secretKey); }
  throw new Error(`Unsupported secret key length: ${bytes.length}`);
}
function loadKeypair(path){ const raw=readFileSync(path,'utf8').trim(); let parsed; try{parsed=JSON.parse(raw);}catch{parsed=raw;} return keypairFromAny(parsed); }

(async () => {
  const conn = new Connection(RPC_URL, 'confirmed');
  const owner = loadKeypair(KEYPAIR_PATH);
  const globalPk = keypairFromAny(JSON.parse(readFileSync(GLOBAL_KEYPAIR_PATH,'utf8'))).publicKey;

  const idl = JSON.parse(readFileSync(IDL_PATH,'utf8'));
  const coder = new anchor.BorshCoder(idl);
  const ixDef = idl.instructions.find(i=>i.name===INSTRUCTION_NAME);
  if(!ixDef) throw new Error('set_executor not in IDL');

  const listRaw = JSON.parse(readFileSync('executors.json','utf8'));
  const list = Array.isArray(listRaw) ? listRaw : [];
  const targets = list.map(e => typeof e === 'string' ? {pubkey:e} : e).filter(e=>!!e.pubkey);

  console.log(`Adding ${targets.length} executors…`);
  for (const entry of targets) {
    const exec = new PublicKey(entry.pubkey);
    const args = {};
    for (const a of ixDef.args || []) {
      if (a.name === 'exec') args.exec = exec;
      else if (a.name === 'enable') args.enable = true;
      else throw new Error(`Unknown arg ${a.name}`);
    }
    const keys = [
      { pubkey: globalPk,        isSigner:false, isWritable:true  }, // global
      { pubkey: owner.publicKey, isSigner:true,  isWritable:true  }  // owner
    ];
    const data = coder.instruction.encode(ixDef.name, args);
    const ix = new TransactionInstruction({ programId: PROGRAM_ID, keys, data });
    const tx = new Transaction().add(ix);
    tx.feePayer = owner.publicKey;
    tx.recentBlockhash = (await conn.getLatestBlockhash('finalized')).blockhash;

    console.log(`-> ${entry.pubkey} (${entry.role||'executor'})`);
    const sig = await sendAndConfirmTransaction(conn, tx, [owner], { commitment: 'confirmed' });
    console.log(`   ✅ tx: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  }
  console.log('All executors added.');
})();
