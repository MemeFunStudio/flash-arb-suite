/* IDL-aware copycat dry-run:
 * - Loads your Anchor IDL (idl/<PROGRAM>.json)
 * - Builds base metas in the exact IDL order (fixes AccountNotSigner for `caller`)
 * - Copies Raydium tx remaining accounts (legacy or v0 parsing)
 * - Auto-pins new accounts as EXTRA_* into ~/.flash-arb/devnet.env
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  Connection, PublicKey, Keypair,
  Transaction, TransactionInstruction, SystemProgram
} = require('@solana/web3.js');

const RPC = process.env.RPC || 'https://api.devnet.solana.com';
const ENV_FILE = path.join(process.env.HOME, '.flash-arb', 'devnet.env');

const env = k => process.env[k] || '';
const pk  = s => new PublicKey(s);

// ---------- ENV (required) ----------
const PROGRAM   = pk(env('PROGRAM'));
const GLOBAL    = pk(env('GLOBAL'));
const POOL      = pk(env('POOL'));
const VAPDA     = pk(env('VAPDA'));
const VATA      = pk(env('VATA'));
const USDC_MINT = pk(env('USDC_MINT'));
const RAY_PROG  = pk(env('RAY_PROG'));
const RAY_POOL  = pk(env('RAY_POOL'));
const TOKEN_PROG = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

// Optional hints
const ORACLE = env('ORACLE') ? pk(env('ORACLE')) : null;
const OBS    = env('OBS')    ? pk(env('OBS'))    : null;
const VA     = env('VAULT_A')? pk(env('VAULT_A')): null;
const VB     = env('VAULT_B')? pk(env('VAULT_B')): null;
const MB     = env('MINT_B') ? pk(env('MINT_B')) : null;

// ---------- Helpers ----------
function loadKeypair() {
  if (fs.existsSync('./phantom-owner.json')) {
    const j = JSON.parse(fs.readFileSync('./phantom-owner.json','utf8'));
    if (j.secretKey) return Keypair.fromSecretKey(Buffer.from(j.secretKey,'base64'));
    if (Array.isArray(j)) return Keypair.fromSecretKey(new Uint8Array(j));
  }
  const idPath = path.join(process.env.HOME, '.config/solana/id.json');
  if (fs.existsSync(idPath)) {
    const arr = JSON.parse(fs.readFileSync(idPath,'utf8'));
    return Keypair.fromSecretKey(new Uint8Array(arr));
  }
  throw new Error('No keypair found (phantom-owner.json or ~/.config/solana/id.json)');
}

function readEnvText(){ try{ return fs.readFileSync(ENV_FILE,'utf8'); }catch{ return ''; } }
function readExtrasFromEnv(){
  const txt = readEnvText();
  const out = [];
  for (const m of txt.matchAll(/^EXTRA_(\d+)=([1-9A-HJ-NP-Za-km-z]{32,44})$/gm)) {
    try{ out.push(new PublicKey(m[2])); }catch{}
  }
  return out;
}
function pinNewExtras(newBase58List){
  if (!newBase58List.length) return 0;
  const txt = readEnvText();
  const set = new Set([...readExtrasFromEnv().map(x=>x.toBase58())]);
  const fixed = new Set([
    GLOBAL,POOL,VAPDA,VATA,USDC_MINT,TOKEN_PROG,SystemProgram.programId,
    RAY_PROG,RAY_POOL, ORACLE,OBS,VA,VB,MB
  ].filter(Boolean).map(p=>p.toBase58()));
  const fresh = newBase58List.filter(b=>!set.has(b) && !fixed.has(b));
  if (!fresh.length) return 0;
  const nums = [...txt.matchAll(/^EXTRA_(\d+)=/gm)].map(m=>+m[1]);
  let next = (nums.length?Math.max(...nums):0) + 1;
  const lines = fresh.map(b=>`EXTRA_${next++}=${b}`);
  fs.mkdirSync(path.dirname(ENV_FILE),{recursive:true});
  fs.writeFileSync(ENV_FILE, (txt && !txt.endsWith('\n')?txt+'\n':txt) + lines.join('\n')+'\n');
  return fresh.length;
}

function discFor(name){ return crypto.createHash('sha256').update('global:'+name).digest().slice(0,8); }
function norm(n){ return String(n||'').toLowerCase().replace(/[^a-z0-9]/g,''); }

function extractKeysAndCompiledIxs(txJson){
  const msg = txJson?.transaction?.message;
  if (!msg) return null;

  // Legacy: accountKeys + instructions
  if (Array.isArray(msg.accountKeys) && Array.isArray(msg.instructions)) {
    const keys = msg.accountKeys.map(k=>new PublicKey(k.toString()));
    const compiled = msg.instructions.map(ix=>({
      programIdIndex: ix.programIdIndex,
      accountIndexes: ix.accounts ?? ix.accountKeyIndexes ?? [],
    }));
    return {keys, compiled};
  }

  // v0: compiledInstructions + lookups
  if (typeof msg.getAccountKeys === 'function') {
    const lookups = txJson.meta?.loadedAddresses || undefined;
    const ak = msg.getAccountKeys({ accountKeysFromLookups: lookups });
    const keys = [
      ...ak.staticAccountKeys,
      ...(ak.accountKeysFromLookups?.writable||[]),
      ...(ak.accountKeysFromLookups?.readonly||[]),
    ].map(k=>new PublicKey(k.toString()));
    const compiled = (msg.compiledInstructions||[]).map(ix=>({
      programIdIndex: ix.programIdIndex,
      accountIndexes: ix.accountKeyIndexes ?? ix.accounts ?? [],
    }));
    return {keys, compiled};
  }
  return null;
}

async function findRecentRayIx(cn){
  const sigs = await cn.getSignaturesForAddress(RAY_POOL, {limit:50});
  for (const s of sigs){
    const tx = await cn.getTransaction(s.signature,{commitment:'confirmed', maxSupportedTransactionVersion:0});
    if (!tx) continue;
    const parsed = extractKeysAndCompiledIxs(tx);
    if (!parsed) continue;
    const {keys, compiled} = parsed;
    if (!compiled?.length) continue;
    const pos = compiled.findIndex(ix=> keys[ix.programIdIndex]?.equals(RAY_PROG));
    if (pos<0) continue;
    return {sig: s.signature, keys, rayIx: compiled[pos]};
  }
  return null;
}

// Flatten Anchor IDL nested accounts
function flatAccounts(defs, out=[]){
  for (const a of (defs||[])){
    out.push(a);
    if (a.accounts) flatAccounts(a.accounts, out);
  }
  return out;
}

(async ()=>{
  const cn = new Connection(RPC,'confirmed');
  const payer = loadKeypair();

  // ---------- Load IDL & instruction ----------
  const idlPath = path.join('idl', PROGRAM.toBase58()+'.json');
  if (!fs.existsSync(idlPath)) throw new Error(`IDL missing at ${idlPath}`);
  const idl = JSON.parse(fs.readFileSync(idlPath,'utf8'));

  const ixDef = idl.instructions.find(i=>['executeroute','execute_route','execute'].includes(norm(i.name)));
  if (!ixDef) throw new Error('execute_route/executeRoute/execute not found in IDL');

  // map names -> pubkeys
  const MAP = {
    global: GLOBAL,
    pool: POOL,
    caller: payer.publicKey,
    vault: VATA, vaultata: VATA, vata: VATA,
    vaultauthority: VAPDA, vaultauth: VAPDA, vault_authority: VAPDA,
    mint: USDC_MINT,
    tokenprogram: TOKEN_PROG, token_program: TOKEN_PROG,
    systemprogram: SystemProgram.programId, system_program: SystemProgram.programId,
  };
  const FORCE_W = new Set(['global','pool','vault','vaultata','vata']);

  // Build base metas in IDL order (critical for Anchor)
  const base = flatAccounts(ixDef.accounts).map(a=>{
    const n = norm(a.name);
    const pk = MAP[n];
    if (!pk) throw new Error(`No mapping for required account: ${a.name}`);
    const isSigner = (n==='caller') || !!a.isSigner;
    const isWritable = FORCE_W.has(n) || !!a.isMut;
    return { pubkey: pk, isSigner, isWritable };
  });

  // ---------- Find a Raydium ix to copy remaining ----------
  const found = await findRecentRayIx(cn);
  if (!found){ console.log('No recent Raydium CLMM tx found on this pool.'); return; }
  const {keys, rayIx} = found;

  // Order remaining: hints -> extrasFromEnv -> rayIx accounts (dedup, preserve order)
  const baseSet = new Set(base.map(k=>k.pubkey.toBase58()));
  const extrasEnv = [ORACLE, OBS, VA, VB, MB, ...readExtrasFromEnv()].filter(Boolean);
  const ordered = [], seen = new Set([...baseSet]);

  for (const hint of extrasEnv){
    const b = hint.toBase58(); if (seen.has(b)) continue;
    seen.add(b); ordered.push({pubkey: hint, isSigner:false, isWritable:false});
    if (ordered.length>=200) break;
  }
  for (const idx of rayIx.accountIndexes){
    const pk = keys[idx]; if (!pk) continue;
    const b = pk.toBase58(); if (seen.has(b)) continue;
    seen.add(b); ordered.push({pubkey: pk, isSigner:false, isWritable:false});
    if (ordered.length>=200) break;
  }

  // Pin newly discovered (limit small per run)
  const newly = ordered.map(m=>m.pubkey.toBase58());
  const added = pinNewExtras(newly);
  if (added) console.log(`Pinned/Merged ${added} EXTRA_* accounts to ${ENV_FILE}`);

  // Build data: discriminator + principal=0 + route_len=0
  const disc = discFor(ixDef.name);
  const data = Buffer.concat([disc, Buffer.alloc(8,0), Buffer.alloc(4,0)]);

  const ix = new TransactionInstruction({ programId: PROGRAM, keys:[...base,...ordered], data });
  const tx = new Transaction().add(ix);
  tx.feePayer = payer.publicKey;
  const { blockhash } = await cn.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.sign(payer);

  const sig = await cn.sendRawTransaction(tx.serialize(), { skipPreflight:true });
  console.log('DRY-RUN SENT:', sig);
  console.log('Explorer:', 'https://explorer.solana.com/tx/'+sig+'?cluster=devnet');
})().catch(e=>{
  console.error('send error:', e.message);
  if (e.transactionLogs) console.error(e.transactionLogs.join('\n'));
});
