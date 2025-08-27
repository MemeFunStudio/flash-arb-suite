/* Dry-run "copycat" — finds a recent Raydium CLMM tx on RAY_POOL and
 * replays its account list as "remaining" for your program's ExecuteRoute.
 * - Works with legacy and v0 transactions.
 * - Auto-pins newly discovered Raydium accounts to ~/.flash-arb/devnet.env
 */

const fs = require('fs');
const crypto = require('crypto');
const {
  Connection, PublicKey, Keypair,
  Transaction, TransactionInstruction, SystemProgram
} = require('@solana/web3.js');

const ENV_PATH = process.env.HOME + '/.flash-arb/devnet.env';
const RPC = process.env.RPC || 'https://api.devnet.solana.com';

function env(k){ return process.env[k] || ''; }
function pk(s){ return new PublicKey(s); }

function loadEnvFile() {
  try { return fs.readFileSync(ENV_PATH, 'utf8'); } catch { return ''; }
}
function readExtrasFromEnv() {
  const txt = loadEnvFile();
  const out = [];
  for (const m of txt.matchAll(/^EXTRA_[A-Za-z0-9_]+=(\S+)/gm)) {
    try { out.push(new PublicKey(m[1])); } catch {}
  }
  return out;
}
function pinExtrasToEnv(newPks = []) {
  if (!newPks.length) return { added: 0 };
  const txt = loadEnvFile();
  const set = new Set([...readExtrasFromEnv().map(x=>x.toBase58())]);
  const fresh = newPks.map(x=>x.toBase58()).filter(b => !set.has(b));
  if (!fresh.length) return { added: 0 };

  // Find next number
  const nums = [...txt.matchAll(/^EXTRA_(\d+)=/gm)].map(m => +m[1]);
  let next = (nums.length ? Math.max(...nums) : 0) + 1;

  const lines = [];
  for (const b of fresh) {
    lines.push(`EXTRA_${next}=${b}`);
    next++;
  }
  fs.mkdirSync(require('path').dirname(ENV_PATH), { recursive: true });
  fs.appendFileSync(ENV_PATH, (txt && !txt.endsWith('\n') ? '\n' : '') + lines.join('\n') + '\n');
  return { added: fresh.length };
}

function loadKeypair() {
  // Try phantom-owner.json (object with base64 secretKey)
  if (fs.existsSync('./phantom-owner.json')) {
    const j = JSON.parse(fs.readFileSync('./phantom-owner.json', 'utf8'));
    if (j.secretKey) return Keypair.fromSecretKey(Buffer.from(j.secretKey, 'base64'));
    if (Array.isArray(j)) return Keypair.fromSecretKey(new Uint8Array(j));
  }
  // Fallback: Solana CLI id.json
  const idPath = process.env.HOME + '/.config/solana/id.json';
  if (fs.existsSync(idPath)) {
    const arr = JSON.parse(fs.readFileSync(idPath, 'utf8'));
    return Keypair.fromSecretKey(new Uint8Array(arr));
  }
  throw new Error('No keypair found (phantom-owner.json or ~/.config/solana/id.json)');
}

function discFor(name) {
  return crypto.createHash('sha256').update('global:'+name).digest().slice(0,8);
}

// Extract keys + compiled instructions for legacy *or* v0
function extractKeysAndCompiledIxs(txJson) {
  const msg = txJson?.transaction?.message;
  if (!msg) return null;

  // Legacy: message.accountKeys + message.instructions
  if (Array.isArray(msg.accountKeys) && Array.isArray(msg.instructions)) {
    const keys = msg.accountKeys.map(k => new PublicKey(k.toString()));
    const compiled = msg.instructions.map(ix => ({
      programIdIndex: ix.programIdIndex,
      accountIndexes: ix.accounts ?? ix.accountKeyIndexes ?? [],
    }));
    return { keys, compiled };
  }

  // v0: compiledInstructions + address table lookups
  if (typeof msg.getAccountKeys === 'function') {
    const lookups = txJson.meta?.loadedAddresses || undefined;
    const ak = msg.getAccountKeys({ accountKeysFromLookups: lookups });
    const keys = [
      ...ak.staticAccountKeys,
      ...(ak.accountKeysFromLookups?.writable || []),
      ...(ak.accountKeysFromLookups?.readonly || []),
    ].map(k => new PublicKey(k.toString()));

    const compiled = (msg.compiledInstructions || []).map(ix => ({
      programIdIndex: ix.programIdIndex,
      accountIndexes: ix.accountKeyIndexes ?? ix.accounts ?? [],
    }));
    return { keys, compiled };
  }

  return null;
}

async function findRecentRayIx(cn, RAY_POOL, RAY_PROG) {
  const sigs = await cn.getSignaturesForAddress(RAY_POOL, { limit: 50 });
  for (const s of sigs) {
    const tx = await cn.getTransaction(s.signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    if (!tx) continue;

    const parsed = extractKeysAndCompiledIxs(tx);
    if (!parsed) continue;
    const { keys, compiled } = parsed;
    if (!compiled?.length) continue;

    const rayPos = compiled.findIndex(ix => {
      const pid = keys[ix.programIdIndex];
      return pid && pid.equals(RAY_PROG);
    });
    if (rayPos < 0) continue;

    return { sig: s.signature, keys, rayIx: compiled[rayPos] };
  }
  return null;
}

(async () => {
  // ---------- Env ----------
  const PROGRAM   = pk(env('PROGRAM'));
  const GLOBAL    = pk(env('GLOBAL'));
  const POOL      = pk(env('POOL'));
  const VAPDA     = pk(env('VAPDA'));
  const VATA      = pk(env('VATA'));
  const USDC_MINT = pk(env('USDC_MINT'));
  const RAY_PROG  = pk(env('RAY_PROG'));
  const RAY_POOL  = pk(env('RAY_POOL'));
  const TOKEN_PROG = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  const ORACLE = env('ORACLE') ? pk(env('ORACLE')) : null;
  const OBS    = env('OBS')    ? pk(env('OBS'))    : null;
  const VA     = env('VAULT_A')? pk(env('VAULT_A')): null;
  const VB     = env('VAULT_B')? pk(env('VAULT_B')): null;
  const MB     = env('MINT_B') ? pk(env('MINT_B')) : null;

  const cn = new Connection(RPC, 'confirmed');
  const payer = loadKeypair();

  // ---------- Build your base metas ----------
  const base = [
    { pubkey: GLOBAL,      isSigner:false, isWritable:true  },
    { pubkey: POOL,        isSigner:false, isWritable:true  },
    { pubkey: payer.publicKey, isSigner:true,  isWritable:true  },
    { pubkey: VATA,        isSigner:false, isWritable:true  },
    { pubkey: VAPDA,       isSigner:false, isWritable:false },
    { pubkey: USDC_MINT,   isSigner:false, isWritable:false },
    { pubkey: TOKEN_PROG,  isSigner:false, isWritable:false },
    { pubkey: SystemProgram.programId, isSigner:false, isWritable:false },
  ];
  const baseSet = new Set(base.map(k => k.pubkey.toBase58()));

  // ---------- Find a fresh Raydium tx on the pool ----------
  const found = await findRecentRayIx(cn, RAY_POOL, RAY_PROG);
  if (!found) {
    console.log('No recent Raydium CLMM tx found on this pool.');
    return;
  }
  const { sig, keys, rayIx } = found;

  // ---------- Assemble remaining accounts ----------
  const ordered = [];
  const seen = new Set();

  // 1) Seed with env-known extras (order sensitive)
  for (const x of [ORACLE, OBS, VA, VB, MB, ...readExtrasFromEnv()]) {
    if (!x) continue;
    const b = x.toBase58();
    if (baseSet.has(b) || seen.has(b)) continue;
    seen.add(b);
    ordered.push({ pubkey:x, isSigner:false, isWritable:false });
    if (ordered.length >= 200) break;
  }

  // 2) Then append from the Ray ix account indexes (preserve order)
  for (const idx of rayIx.accountIndexes) {
    const pk = keys[idx];
    if (!pk) continue;
    const b = pk.toBase58();
    if (baseSet.has(b) || seen.has(b)) continue;
    seen.add(b);
    ordered.push({ pubkey:pk, isSigner:false, isWritable:false });
    if (ordered.length >= 200) break;
  }

  // Pin any newly found accounts to env so we keep growing the set
  const newlyFound = ordered
    .map(x => x.pubkey)
    .filter(pk => !readExtrasFromEnv().some(e => e.equals(pk)))
    .slice(0, 8); // avoid spamming file in one go
  const { added } = pinExtrasToEnv(newlyFound);
  if (added) console.log(`Pinned/Merged ${added} EXTRA_* accounts to ${ENV_PATH}`);

  // ---------- Build & send the dry-run ----------
  const name = 'execute_route'; // anchor global method name
  const data = Buffer.concat([discFor(name), Buffer.alloc(8,0), Buffer.alloc(4,0)]);

  const ix = new TransactionInstruction({
    programId: PROGRAM,
    keys: [...base, ...ordered],
    data
  });

  const tx = new Transaction().add(ix);
  tx.feePayer = payer.publicKey;
  const { blockhash } = await cn.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.sign(payer);

  const signature = await cn.sendRawTransaction(tx.serialize(), { skipPreflight:true });
  console.log('DRY-RUN SENT:', signature);
  console.log('Explorer:', 'https://explorer.solana.com/tx/'+signature+'?cluster=devnet');
})().catch(e=>{
  console.error('send error:', e.message);
  if (e.transactionLogs) console.error(e.transactionLogs.join('\n'));
});
