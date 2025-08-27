import { readFileSync, writeFileSync, existsSync } from 'fs';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

const RPC_URL = 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey('9ckBy54vd9G6FmR63Z4PoLtNq8rbtoYzhVbJGx458Kmn');
const IDL_PATH = 'idl/flash_executor.json';
const KEYPAIR_PATH = 'phantom-owner.json';
const GLOBAL_KEYPAIR_PATH = 'global.json';
const INSTRUCTION_NAME = 'initialize_global';

// --- helpers ---
function tryDecodeStringKey(str){ if(!str||typeof str!=='string') return null; const s=str.trim();
  try{const b=bs58.decode(s); if(b.length===32||b.length===64) return new Uint8Array(b);}catch{}
  try{const b=Buffer.from(s,'base64'); if(b.length===32||b.length===64) return new Uint8Array(b);}catch{}
  try{const hh=s.startsWith('0x')?s.slice(2):s; const b=Buffer.from(hh,'hex'); if(b.length===32||b.length===64) return new Uint8Array(b);}catch{}
  return null;
}
function pickBytesFromObject(o){
  for(const k of ['secretKey','privateKey','sk','key','ed25519']) if(Array.isArray(o?.[k])) return Uint8Array.from(o[k]);
  for(const k of ['secretKey','privateKey','sk','key','ed25519','private_key','pk','seed']){ const b=tryDecodeStringKey(o?.[k]); if(b) return b; }
  for(const [k,v] of Object.entries(o)){
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
  if(!bytes) throw new Error('Unrecognized key file format (object). Include base58/base64/hex private key or 32/64-byte array.');
  if(bytes.length===64) return Keypair.fromSecretKey(bytes);
  if(bytes.length===32){ const kp=nacl.sign.keyPair.fromSeed(bytes); return Keypair.fromSecretKey(kp.secretKey); }
  throw new Error(`Unsupported secret key length: ${bytes.length}`);
}
function loadKeypair(path){ const raw=readFileSync(path,'utf8').trim(); let parsed; try{parsed=JSON.parse(raw);}catch{parsed=raw;} return keypairFromAny(parsed); }
function ensureKeypair(path){ if(existsSync(path)) return loadKeypair(path); const kp=Keypair.generate(); writeFileSync(path, JSON.stringify(Array.from(kp.secretKey))); console.log(`Saved new keypair -> ${path}`); return kp; }
function flatten(accs){const out=[];for(const a of accs||[]){if(a.accounts) out.push(...flatten(a.accounts)); else out.push(a);}return out;}

// --- main ---
(async () => {
  const conn = new Connection(RPC_URL, 'confirmed');
  const payer = loadKeypair(KEYPAIR_PATH);
  const globalKp = ensureKeypair(GLOBAL_KEYPAIR_PATH);

  const idl = JSON.parse(readFileSync(IDL_PATH, 'utf8'));
  if (idl.address && idl.address !== PROGRAM_ID.toBase58()) throw new Error(`IDL address (${idl.address}) != Program ID (${PROGRAM_ID.toBase58()})`);

  const ixDef = idl.instructions.find(i => i.name === INSTRUCTION_NAME) || idl.instructions.find(i => i.name === 'initialize');
  if (!ixDef) throw new Error(`Instruction "${INSTRUCTION_NAME}" not found in IDL.`);

  console.log('Payer:', payer.publicKey.toBase58());
  console.log('Global (signer):', globalKp.publicKey.toBase58());

  const args = {};
  for (const a of ixDef.args || []) {
    if (a.name === 'owner') args.owner = new PublicKey(process.env.OWNER || payer.publicKey.toBase58());
    else throw new Error(`Unmapped arg "${a.name}" — set it here.\n${JSON.stringify(ixDef.args,null,2)}`);
  }

  const coder = new anchor.BorshCoder(idl);
  const keys = flatten(ixDef.accounts).map(acc => {
    const name = acc.name || acc.account || '';
    let pubkey;
    if (name === 'global') pubkey = globalKp.publicKey;
    else if (['payer','authority','owner','signer'].includes(name)) pubkey = payer.publicKey;
    else if (name === 'systemProgram' || name === 'system_program') pubkey = SystemProgram.programId;
    else throw new Error(`Unmapped account "${name}". Add mapping.`);

    // ✅ Respect all possible IDL flags: writable / isWritable / isMut / mut
    const isMut = (acc.isMut ?? acc.mut ?? acc.writable ?? acc.isWritable ?? false);
    const isSigner = (acc.isSigner ?? acc.signer ?? false);
    return { pubkey, isWritable: !!isMut, isSigner: !!isSigner };
  });

  const data = coder.instruction.encode(ixDef.name, args);
  const ix = new TransactionInstruction({ programId: PROGRAM_ID, keys, data });
  const tx = new Transaction().add(ix);
  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash('finalized')).blockhash;

  console.log('Sending real transaction…');
  const sig = await sendAndConfirmTransaction(conn, tx, [payer, globalKp], { commitment: 'confirmed' });
  console.log('✅ initialize_global sent\nSignature:', sig);
  console.log(`Explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
})().catch(e => { console.error('FAILED initialize_global:', e.message ?? e); process.exit(1); });
