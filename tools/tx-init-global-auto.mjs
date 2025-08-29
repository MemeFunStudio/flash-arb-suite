// tools/tx-init-global-auto.mjs
// Wide brute-force GLOBAL PDA initializer for Anchor/solana programs.
// It enumerates a large set of seed words and combos and picks the first
// candidate that simulates without fatal error, then sends it.
//
// Prints machine-readable lines like:
//   GLOBAL_SEEDS=...     (human label of seeds used)
//   GLOBAL_PDA=...       (derived PDA)
//   GLOBAL_BUMP=...      (bump if available)
//   INIT_GLOBAL_SIG=...  (tx sig)
//   EXPLORER=...         (explorer URL)
//   GLOBAL_DLEN=...      (post-init data length)
//
// Usage:
//   export SOLANA_KEYPAIR="$HOME/.flash-arb/keys/devnet-payer.json"
//   set -a; source env/local.devnet.env; set +a
//   node tools/tx-init-global-auto.mjs | tee /tmp/init_global.out

import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction, Keypair } from '@solana/web3.js';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';

function sighash(name) {
  // Anchor discriminator: sha256('global:' + name)[0..7]
  return createHash('sha256').update('global:' + name).digest().subarray(0, 8);
}

function loadKeypair(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function pkFromEnv(name, fallback) {
  const v = process.env[name];
  return v ? new PublicKey(v) : fallback;
}

function unique(arr) {
  return Array.from(new Set(arr));
}

async function main() {
  const rpc =
    process.env.DEVNET_RPC ||
    process.env.RPC_URL ||
    'https://api.devnet.solana.com';

  if (!process.env.PROGRAM) {
    console.log('INIT_GLOBAL_ERROR=Missing env PROGRAM');
    process.exit(1);
  }
  if (!process.env.SOLANA_KEYPAIR) {
    console.log('INIT_GLOBAL_ERROR=Missing env SOLANA_KEYPAIR');
    process.exit(1);
  }

  const programId = new PublicKey(process.env.PROGRAM);
  const payer = loadKeypair(process.env.SOLANA_KEYPAIR);

  // OWNER for your program; default to payer if not provided.
  const ownerPub = pkFromEnv('OWNER', payer.publicKey);
  const payerPub = payer.publicKey;

  const conn = new Connection(rpc, 'confirmed');

  // initialize_global(owner: Pubkey)
  const data = Buffer.concat([sighash('initialize_global'), ownerPub.toBuffer()]);

  const baseWords = [
    'global',
    'config',
    'global_config',
    'state',
    'global_state',
    'settings',
    'controller',
    'flash',
    'flash_global',
    'flash_state',
    'flash_config',
    'flash_executor',
    'executor',
    'exec',
    'cfg',
  ];

  // Include case/case+dash variants
  const wordVariants = unique(
    baseWords.flatMap((w) => {
      const dash = w.replace(/_/g, '-');
      const up = w.toUpperCase();
      const cap = w[0].toUpperCase() + w.slice(1);
      return [w, dash, up, cap];
    })
  );

  // Build seed layouts for a given atom (word or literal)
  const seedLayoutsFor = (buf) => [
    { label: `[${buf.label}]`, seeds: [buf.buf] },
    { label: `[${buf.label}, owner]`, seeds: [buf.buf, ownerPub.toBuffer()] },
    { label: `[${buf.label}, payer]`, seeds: [buf.buf, payerPub.toBuffer()] },
    { label: `[${buf.label}, programId]`, seeds: [buf.buf, programId.toBuffer()] },

    // reversed order (some codebases do this)
    { label: `[owner, ${buf.label}]`, seeds: [ownerPub.toBuffer(), buf.buf] },
    { label: `[payer, ${buf.label}]`, seeds: [payerPub.toBuffer(), buf.buf] },
    { label: `[programId, ${buf.label}]`, seeds: [programId.toBuffer(), buf.buf] },
  ];

  const atoms = [
    ...wordVariants.map((w) => ({ label: `'${w}'`, buf: Buffer.from(w) })),
    // a few ultra-common literals
    { label: `'GLOBAL'`, buf: Buffer.from('GLOBAL') },
    { label: `'Global'`, buf: Buffer.from('Global') },
  ];

  // Prefer the most plausible ones first
  const favorites = [
    { label: `'global'`, buf: Buffer.from('global') },
    { label: `'GLOBAL'`, buf: Buffer.from('GLOBAL') },
    { label: `'global_config'`, buf: Buffer.from('global_config') },
    { label: `'state'`, buf: Buffer.from('state') },
    { label: `'flash_global'`, buf: Buffer.from('flash_global') },
    { label: `'flash_executor'`, buf: Buffer.from('flash_executor') },
  ];

  // Candidate list in order
  const candidates = unique([
    ...favorites.flatMap(seedLayoutsFor),
    ...atoms.flatMap(seedLayoutsFor),
  ].map(JSON.stringify)).map(JSON.parse);

  // Build accounts array for ix
  const buildKeys = (GLOBAL) => [
    { pubkey: GLOBAL,                  isSigner: false, isWritable: true  },
    { pubkey: payerPub,                isSigner: true,  isWritable: true  },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  // Acceptable simulation:
  // - err == null; or
  // - err exists but *not* a hard privilege/seeds error; we permit AccountNotFound
  //   and some benign preflight failures (simulate varies across nodes).
  const isAcceptableSim = (sim) => {
    if (!sim?.value) return false;
    if (!sim.value.err) return true;
    const s = JSON.stringify(sim.value.err);
    // reject common hard failures
    if (/PrivilegeEscalation|privilege|Readonly/iu.test(s)) return false;
    if (/ProgramFailedToComplete|InsufficientFunds/iu.test(s)) return false;
    if (/InvalidArgument|InvalidSeeds|ConstraintSeeds|Constraint/iu.test(s)) return false;
    // allow missing accounts, since handler might create them
    if (/AccountNotFound|Could not find account/iu.test(s)) return true;
    return false;
  };

  let chosen = null; // { GLOBAL, label, bump, ix }

  for (const c of candidates) {
    try {
      const [pda, bump] = PublicKey.findProgramAddressSync(c.seeds.map((s) => Buffer.from(s)), programId);
      const ix = new TransactionInstruction({ programId, keys: buildKeys(pda), data });

      const tx = new Transaction().add(ix);
      tx.feePayer = payerPub;
      tx.recentBlockhash = (await conn.getLatestBlockhash('confirmed')).blockhash;
      tx.sign(payer);

      const sim = await conn.simulateTransaction(tx, {
        sigVerify: true,
        commitment: 'confirmed',
        replaceRecentBlockhash: true,
        encoding: 'base64',
      });

      if (isAcceptableSim(sim)) {
        chosen = { GLOBAL: pda, label: c.label, bump, ix };
        break;
      }
    } catch {
      // keep trying
    }
  }

  if (!chosen) {
    const tried = wordVariants.slice(0, 64).join(',');
    console.log('AUTO_DETECT_FAILED=No seed pattern simulated successfully.');
    console.log('SEEDS_TRIED=' + tried + (wordVariants.length > 64 ? ',...' : ''));
    process.exit(1);
  }

  const tx2 = new Transaction().add(chosen.ix);
  tx2.feePayer = payerPub;
  tx2.recentBlockhash = (await conn.getLatestBlockhash('confirmed')).blockhash;
  tx2.sign(payer);

  try {
    const sig = await conn.sendRawTransaction(tx2.serialize(), { skipPreflight: false, maxRetries: 3 });
    await conn.confirmTransaction(sig, 'confirmed');
    const info = await conn.getAccountInfo(chosen.GLOBAL, 'confirmed');
    const dlen = info?.data?.length || 0;

    console.log('GLOBAL_SEEDS=' + chosen.label);
    console.log('GLOBAL_PDA=' + chosen.GLOBAL.toBase58());
    if (typeof chosen.bump === 'number') console.log('GLOBAL_BUMP=' + chosen.bump);
    console.log('INIT_GLOBAL_SIG=' + sig);
    console.log('EXPLORER=https://explorer.solana.com/tx/' + sig + '?cluster=devnet');
    console.log('GLOBAL_DLEN=' + dlen);
  } catch (e) {
    console.log('INIT_GLOBAL_ERROR=' + (e?.message || String(e)));
    process.exit(1);
  }
}

main().catch((e) => {
  console.log('INIT_GLOBAL_ERROR=' + (e?.message || String(e)));
  process.exit(1);
});
