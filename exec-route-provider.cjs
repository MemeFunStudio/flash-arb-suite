#!/usr/bin/env node
"use strict";
const guard = require('./scripts/guard.cjs');

const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} = require("@solana/web3.js");

// ---- env loader ----
function loadEnvFile(p) {
  const out = {};
  if (!fs.existsSync(p)) return out;
  const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);
  for (const l of lines) {
    const m = /^export\s+([A-Z0-9_]+)=(.*)$/.exec(l);
    if (!m) continue;
    const k = m[1];
    const v = m[2].replace(/^['"]|['"]$/g, "");
    out[k] = v;
  }
  return out;
}
const ENV_PATH = process.env.ENV || (os.homedir() + "/.flash-arb/devnet.env");
const fileEnv = loadEnvFile(ENV_PATH);
const ENV = { ...fileEnv, ...process.env };

// ---- helpers ----
function __toPk(x) {
  const v = (x == null ? "" : String(x)).trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)) {
    throw new Error("Bad pubkey: " + JSON.stringify(x));
  }
  return new PublicKey(v);
}
function uniqMetas(metas) {
  const seen = new Set();
  const out = [];
  for (const m of metas) {
    const k = m.pubkey.toBase58();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m);
  }
  return out;
}

// ---- payer ----
const kpRaw = JSON.parse(fs.readFileSync("./phantom-owner.json", "utf8"));
const sk = Array.isArray(kpRaw.secretKey) ? kpRaw.secretKey : kpRaw;
const payer = Keypair.fromSecretKey(Uint8Array.from(sk));

// ---- core ids ----
if (!ENV.PROGRAM) throw new Error("Missing PROGRAM in env");
const PROGRAM = __toPk(ENV.PROGRAM);
const RPC = (ENV.RPC || "").trim();
if (!/^https?:\/\//i.test(RPC)) throw new Error("RPC must be http(s)");

// ---- base accounts (from common names if present) ----
const baseNames = [
  ["GLOBAL", true],
  ["POOL", true],
  ["VAULT_AUTHORITY", false],
  ["VAULT", true],
  ["CALLER", false],
  ["AUTHORITY", false],
  ["OWNER", false],
  ["MINT", false],
];
const base = [];
for (const [name, writable] of baseNames) {
  if (!ENV[name]) continue;
  base.push({ pubkey: __toPk(ENV[name]), isSigner: (name==="CALLER"), isWritable: !!writable });
}
// always include a couple of known programs if not already present
const ensurePk = (pk) => ({ pubkey: __toPk(pk), isSigner: false, isWritable: false });
const TOKEN_PROG = ENV.TOKEN_PROGRAM || "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const SYSVAR_RENT = ENV.SYSVAR_RENT || "SysvarRent111111111111111111111111111111111";
const SYSTEM = "11111111111111111111111111111111";
for (const must of [TOKEN_PROG, SYSVAR_RENT, SYSTEM]) {
  const b58 = new PublicKey(must).toBase58();
  if (!base.some(m => m.pubkey.toBase58() === b58)) base.push(ensurePk(must));
}

// ---- extras (EXTRA_*) ----
const namedExtras = Object.keys(ENV)
  .filter(k => /^EXTRA_\d+$/.test(k))
  .sort((a, b) => parseInt(a.split("_")[1], 10) - parseInt(b.split("_")[1], 10))
  .map(k => ({ pubkey: __toPk(ENV[k]), isSigner: false, isWritable: false }));

// keep base also in remaining (non-signer), program expects them there
const baseForRemaining = base.map(m => ({ pubkey: m.pubkey, isSigner: false, isWritable: !!m.isWritable }));

const remaining = uniqMetas([...baseForRemaining, ...namedExtras]).slice(0, 200);

// ---- provider pre/post (safe defaults, optional Port wiring) ----
const preInstrs = [];
const postInstrs = [];
const provider = (ENV.FL_PROVIDER || "NONE").toUpperCase();

if (provider === "PORT") {
  try {
    const { buildPortFlashLoanIxs } = require("./providers/port.cjs");
    const cfg = {
      PROGRAM_ID: ENV.PORT_PROG || "",
      LENDING_MARKET: ENV.PORT_LENDING_MARKET || "",
      USDC_RESERVE: ENV.PORT_USDC_RESERVE || "",
      USDC_LIQ_SUPPLY: ENV.PORT_USDC_LIQ_SUPPLY || "",
      USDC_FEE_RECEIVER: ENV.PORT_USDC_FEE_RECEIVER || "",
      HOST_FEE: ENV.PORT_USDC_HOST_FEE || "",
    };
    const built = buildPortFlashLoanIxs(cfg, payer.publicKey);
    if (built && Array.isArray(built.pre)) preInstrs.push(...built.pre);
    if (built && Array.isArray(built.post)) postInstrs.push(...built.post);
  } catch (e) {
    console.warn("[PORT] provider wiring failed:", e.message);
  }
} else if (provider === "MANGO") {
  console.warn("[MANGO] provider stubs not yet wired");
}

// ---- build program instruction ----
// discriminator for "global:execute_route"
const disc = Buffer.from([246, 14, 81, 121, 140, 237, 86, 23]);
// principal u64 = 0, route_len u32 = 0
const data = Buffer.concat([disc, Buffer.alloc(8, 0), Buffer.alloc(4, 0)]);

const ordered = remaining;
const execIx = new TransactionInstruction({
  programId: PROGRAM,
  keys: [...base, ...ordered],
  data,
});

// ---- compose & send ----
(async () => {
  const cn = new Connection(RPC, "confirmed");
  const tx = new Transaction();
  preInstrs.forEach(ix => tx.add(ix));
  tx.add(execIx);
  postInstrs.forEach(ix => tx.add(ix));

  tx.feePayer = payer.publicKey;
  const { blockhash } = await cn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.sign(payer);

  const sig = await guard.sendSafe(cn, tx, [payer], process.env, payer.publicKey.toBase58());  console.log("SENT:", sig);
  const clusterTag = /devnet/i.test(RPC) ? "devnet" : "mainnet";
  console.log("Explorer: https://explorer.solana.com/tx/" + sig + "?cluster=" + clusterTag);
})().catch(e => {
  console.error("send error:", e.message);
  if (e.transactionLogs) console.error(e.transactionLogs.join("\n"));
  process.exit(1);
});
