// runner.mjs
// Clean Devnet runner: initialize + whitelist DEXes + set executors + (optional) pool work
// Zero mocks: every action sends a real Devnet tx and prints a Solana Explorer link.

// Usage examples (after installing deps; see setup at bottom):
//  node runner.mjs list --idl ./target/idl/flash_arb.json --program 9ckBy54vd9G6FmR63Z4PoLtNq8rbtoYzhVbJGx458Kmn
//  node runner.mjs ping --rpc https://api.devnet.solana.com
//  node runner.mjs init-global --idl ./target/idl/flash_arb.json --program 9ckBy5... --owner ~/.config/solana/id.json
//  node runner.mjs whitelist-registry --idl ./target/idl/flash_arb.json --program 9ckBy5... --owner ~/.config/solana/id.json
//  node runner.mjs set-executors --idl ./target/idl/flash_arb.json --program 9ckBy5... --owner ~/.config/solana/id.json --tier1 1 --tier2 2 --tier3 3
//
// Note: Instruction names must match your IDL. Defaults below assume common Anchor names:
//   initialize_global, whitelist_dex, set_executor_tier
// If your names differ, pass --ix-init-global, --ix-whitelist, --ix-set-executor accordingly.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import {
  Connection, PublicKey, Keypair,
  SystemProgram, Transaction, sendAndConfirmTransaction, clusterApiUrl,
} from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';

// ---------- CONFIG YOU CAN EDIT (or override with CLI flags) ----------
const DEFAULTS = {
  rpc: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  commitment: 'confirmed',
  // Your deployed program:
  programId: '9ckBy54vd9G6FmR63Z4PoLtNq8rbtoYzhVbJGx458Kmn',
  idlPath: './target/idl/flash_arb.json',

  // PDA seeds (adjust if your contract uses different seeds)
  globalSeed: 'global',         // seed string for global PDA
  // DEX whitelist registry (from your earlier message)
  dexRegistry: [
    { name: 'orca_whirlpools',      programId: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc' },
    { name: 'raydium_cp_swap',      programId: 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C' },
    { name: 'raydium_amm_v4',       programId: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8' },
    { name: 'openbook_v2',          programId: 'opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb' },
    { name: 'saber_stable_swap',    programId: 'SSwpkEEcbUqx4vtoEByFjSkhKdCT862DNVb52nZg1UZ' },
    { name: 'mercurial_stable_swap',programId: 'MERLuDFBMmsHnsBPZw2sDQZHvXFMwp8EdjudcU2HKky' },
    { name: 'meteora_cp_amm',       programId: 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG' },
  ],

  // Autobot executors (pubkeys)
  executors: {
    btc:  '4EoqK5CRfK4Jy4qF6BMLWEPcqtgY1dd2xuoieePM35tM',
    eth:  '6ZvjbY3CmHCjJjdGSh7GXeJSMbFk7iCuMMQZABva2ow9',
    alts: 'B9hc2SHHybJm2EnBvbWG8R7p2MoYoYn1obmm34WMRTcZ',
  },

  // Default ix names (override with CLI if your IDL uses different names)
  ix: {
    initGlobal: 'initialize_global',
    whitelistDex: 'whitelist_dex',
    setExecutorTier: 'set_executor_tier',
  },
};
// ---------------------------------------------------------------------

// small wallet wrapper for Anchor provider
class NodeWallet {
  constructor(kp) { this.kp = kp; this.publicKey = kp.publicKey; }
  async signTransaction(tx) { tx.partialSign(this.kp); return tx; }
  async signAllTransactions(txs) { txs.forEach(tx => tx.partialSign(this.kp)); return txs; }
}

const explorerTx = (sig, cluster='devnet') => `https://explorer.solana.com/tx/${sig}?cluster=${cluster}`;

function loadKeypair(p) {
  // Accept both keypair JSON array or solana-keygen JSON { secretKey: [...] }
  const buf = fs.readFileSync(p, 'utf8');
  const j = JSON.parse(buf);
  const arr = Array.isArray(j) ? j : (j.secretKey || j._keypair?.secretKey);
  if (!arr) throw new Error(`Cannot parse keypair at ${p}`);
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

async function makeProgram({ rpc, commitment, idlPath, programId, ownerPath }) {
  const connection = new Connection(rpc, { commitment });
  const kp = loadKeypair(ownerPath);
  const wallet = new NodeWallet(kp);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment });
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
  const program = new anchor.Program(idl, new PublicKey(programId), provider);
  return { program, provider, connection, wallet, owner: kp };
}

async function assertProgramExecutable(connection, programId) {
  const ai = await connection.getAccountInfo(new PublicKey(programId));
  if (!ai) throw new Error(`Program ${programId} not found on-chain`);
  if (!ai.executable) throw new Error(`Account ${programId} exists but is NOT executable`);
}

async function derivePda(programId, seedStrings = [], seedBytes = []) {
  const seeds = [
    ...seedStrings.map(s => Buffer.from(s)),
    ...seedBytes,
  ];
  return await PublicKey.findProgramAddress(seeds, new PublicKey(programId));
}

// ————— Commands —————

async function cmdPing(argv) {
  const rpc = argv.rpc || DEFAULTS.rpc;
  const connection = new Connection(rpc, DEFAULTS.commitment);
  const v = await connection.getVersion();
  console.log('RPC ok', v);
}

async function cmdList(argv) {
  const { program } = await makeProgram({
    rpc: argv.rpc || DEFAULTS.rpc,
    commitment: DEFAULTS.commitment,
    idlPath: argv.idl || DEFAULTS.idlPath,
    programId: argv.program || DEFAULTS.programId,
    ownerPath: argv.owner || path.join(process.env.HOME, '.config/solana/id.json'),
  });
  console.log('Program ID:', program.programId.toBase58());
  console.log('Instructions available:');
  for (const ix of program.idl.instructions) {
    console.log('-', ix.name, 'args:', ix.args.map(a=>`${a.name}:${a.type}`), 'accounts:', ix.accounts.map(a=>a.name));
  }
}

async function cmdInitGlobal(argv) {
  const rpc = argv.rpc || DEFAULTS.rpc;
  const programId = argv.program || DEFAULTS.programId;
  const seed = argv.globalSeed || DEFAULTS.globalSeed;

  const { program, provider, connection, owner } = await makeProgram({
    rpc, commitment: DEFAULTS.commitment,
    idlPath: argv.idl || DEFAULTS.idlPath,
    programId,
    ownerPath: argv.owner || path.join(process.env.HOME, '.config/solana/id.json'),
  });

  await assertProgramExecutable(connection, programId);

  const [globalPda] = await derivePda(program.programId, [seed]);

  // Guess common account shape: { global, authority, systemProgram }
  // If your IDL differs (e.g., 'owner' instead of 'authority'), pass --ix-init-global to change name,
  // or edit the map below to match your IDL exactly:
  const ixName = argv.ixInitGlobal || DEFAULTS.ix.initGlobal;

  const accountsGuessList = [
    { try: 'global', value: globalPda },
    { try: 'authority', value: owner.publicKey },
    { try: 'owner', value: owner.publicKey },
    { try: 'payer', value: owner.publicKey },
    { try: 'systemProgram', value: SystemProgram.programId },
  ];

  // Build account map by matching IDL names
  const idlIx = program.idl.instructions.find(i => i.name === ixName);
  if (!idlIx) throw new Error(`IX '${ixName}' not found in IDL. Use --ix-init-global to set the correct name or run 'list'`);
  const accounts = {};
  for (const a of idlIx.accounts) {
    const m = accountsGuessList.find(x => x.try === a.name);
    if (!m) throw new Error(`Please supply account '${a.name}' for ${ixName}. (Adjust code or pass another ix name)`);
    accounts[a.name] = m.value;
  }

  // Build and send instruction (no args expected — if yours has args, pass via --args-json)
  let builder = program.methods[ixName]();
  if (argv.argsJson) {
    const args = JSON.parse(fs.readFileSync(argv.argsJson, 'utf8'));
    builder = program.methods[ixName](...args);
  }

  const sig = await builder.accounts(accounts).rpc();
  console.log('Initialize Global:', explorerTx(sig));
}

async function cmdWhitelistRegistry(argv) {
  const rpc = argv.rpc || DEFAULTS.rpc;
  const programId = argv.program || DEFAULTS.programId;
  const ixName = argv.ixWhitelist || DEFAULTS.ix.whitelistDex;

  const { program, connection, owner } = await makeProgram({
    rpc, commitment: DEFAULTS.commitment,
    idlPath: argv.idl || DEFAULTS.idlPath,
    programId,
    ownerPath: argv.owner || path.join(process.env.HOME, '.config/solana/id.json'),
  });

  await assertProgramExecutable(connection, programId);

  const [globalPda] = await derivePda(program.programId, [argv.globalSeed || DEFAULTS.globalSeed]);

  const idlIx = program.idl.instructions.find(i => i.name === ixName);
  if (!idlIx) throw new Error(`IX '${ixName}' not in IDL. Run 'list' to see names or pass --ix-whitelist.`);

  // Find likely account names
  const pick = (name, fallback) => idlIx.accounts.some(a => a.name === name) ? name : fallback;

  const globalKey = pick('global', null);
  const authKey   = idlIx.accounts.some(a => a.name === 'authority') ? 'authority'
                   : idlIx.accounts.some(a => a.name === 'owner') ? 'owner'
                   : idlIx.accounts.some(a => a.name === 'payer') ? 'payer'
                   : null;
  const dexKey    = pick('dex_program', null) || pick('dexProgram', null) || pick('dex', null);

  if (!globalKey || !authKey || !dexKey) {
    throw new Error(`Cannot infer account names for '${ixName}'. Edit this function to match your IDL accounts.`);
  }

  for (const d of DEFAULTS.dexRegistry) {
    const dexPk = new PublicKey(d.programId);
    let builder = program.methods[ixName](); // no args; add args here if your IDL needs them
    const accounts = {
      [globalKey]: globalPda,
      [authKey]: owner.publicKey,
      [dexKey]: dexPk,
    };

    const sig = await builder.accounts(accounts).rpc();
    console.log(`Whitelisted ${d.name} (${d.programId}):`, explorerTx(sig));
  }
}

async function cmdSetExecutors(argv) {
  const rpc = argv.rpc || DEFAULTS.rpc;
  const programId = argv.program || DEFAULTS.programId;
  const ixName = argv.ixSetExecutor || DEFAULTS.ix.setExecutorTier;

  const { program, connection, owner } = await makeProgram({
    rpc, commitment: DEFAULTS.commitment,
    idlPath: argv.idl || DEFAULTS.idlPath,
    programId,
    ownerPath: argv.owner || path.join(process.env.HOME, '.config/solana/id.json'),
  });
  await assertProgramExecutable(connection, programId);

  const [globalPda] = await derivePda(program.programId, [argv.globalSeed || DEFAULTS.globalSeed]);

  const idlIx = program.idl.instructions.find(i => i.name === ixName);
  if (!idlIx) throw new Error(`IX '${ixName}' not in IDL. Run 'list' to see names or pass --ix-set-executor.`);

  const globalKey = idlIx.accounts.find(a => a.name === 'global')?.name;
  const authKey = idlIx.accounts.find(a => ['authority','owner','payer'].includes(a.name))?.name;
  const execKey = idlIx.accounts.find(a => a.name.includes('executor'))?.name || 'executor';

  if (!globalKey || !authKey || !execKey) {
    throw new Error(`Cannot infer accounts for '${ixName}'. Edit mapping in cmdSetExecutors() to your IDL.`);
  }

  const tiers = [
    { label: 'btc',  pk: new PublicKey(DEFAULTS.executors.btc),  tier: Number(argv.tier1 ?? 1) },
    { label: 'eth',  pk: new PublicKey(DEFAULTS.executors.eth),  tier: Number(argv.tier2 ?? 2) },
    { label: 'alts', pk: new PublicKey(DEFAULTS.executors.alts), tier: Number(argv.tier3 ?? 3) },
  ];

  for (const t of tiers) {
    let builder;
    // usually one u8 arg (tier). If your IDL requires different args, pass --args-json or adjust below.
    if (argv.argsJson) {
      const args = JSON.parse(fs.readFileSync(argv.argsJson,'utf8'));
      builder = program.methods[ixName](...args);
    } else {
      builder = program.methods[ixName](t.tier);
    }
    const accounts = {
      [globalKey]: globalPda,
      [authKey]: owner.publicKey,
      [execKey]: t.pk,
    };
    const sig = await builder.accounts(accounts).rpc();
    console.log(`Set executor ${t.label} -> tier ${t.tier}:`, explorerTx(sig));
  }
}

// yargs CLI
yargs(hideBin(process.argv))
  .scriptName('runner')
  .command('ping', 'RPC sanity check', {}, cmdPing)
  .command('list', 'List instructions in IDL', {
    idl: { type: 'string', demandOption: true },
    program: { type: 'string', demandOption: true },
    rpc: { type: 'string', default: DEFAULTS.rpc },
  }, cmdList)
  .command('init-global', 'Initialize global PDA', {
    idl: { type: 'string', default: DEFAULTS.idlPath },
    program: { type: 'string', default: DEFAULTS.programId },
    owner: { type: 'string', describe: 'Path to owner keypair json', demandOption: true },
    rpc: { type: 'string', default: DEFAULTS.rpc },
    globalSeed: { type: 'string', default: DEFAULTS.globalSeed },
    ixInitGlobal: { type: 'string', describe: 'Instruction name override' },
    argsJson: { type: 'string', describe: 'Optional args: JSON array file' },
  }, cmdInitGlobal)
  .command('whitelist-registry', 'Whitelist all DEX program IDs from registry', {
    idl: { type: 'string', default: DEFAULTS.idlPath },
    program: { type: 'string', default: DEFAULTS.programId },
    owner: { type: 'string', demandOption: true },
    rpc: { type: 'string', default: DEFAULTS.rpc },
    globalSeed: { type: 'string', default: DEFAULTS.globalSeed },
    ixWhitelist: { type: 'string', describe: 'Instruction name override' },
  }, cmdWhitelistRegistry)
  .command('set-executors', 'Set tier for 3 autobot executors', {
    idl: { type: 'string', default: DEFAULTS.idlPath },
    program: { type: 'string', default: DEFAULTS.programId },
    owner: { type: 'string', demandOption: true },
    rpc: { type: 'string', default: DEFAULTS.rpc },
    globalSeed: { type: 'string', default: DEFAULTS.globalSeed },
    ixSetExecutor: { type: 'string', describe: 'Instruction name override' },
    tier1: { type: 'number', default: 1 },
    tier2: { type: 'number', default: 2 },
    tier3: { type: 'number', default: 3 },
    argsJson: { type: 'string', describe: 'If your ix takes different args, provide JSON array' },
  }, cmdSetExecutors)
  .demandCommand(1)
  .help()
  .strict()
  .parse();
