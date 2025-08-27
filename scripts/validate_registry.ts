// Strict validator for configs/dex_registry.json
// Usage: npx tsx scripts/validate_registry.ts
// Env:
//   ANCHOR_PROVIDER_URL=https://api.mainnet-beta.solana.com (or devnet)
//   SKIP_CHAIN_CHECKS=1   -> skip on-chain executable checks (useful on devnet where some DEXes aren't deployed)
import fs from "fs";
import { Connection, PublicKey } from "@solana/web3.js";

type DexEntry = { name: string; program_id: string };

function die(msg: string, code = 1) {
  console.error(`\n[validate_registry] ERROR: ${msg}\n`);
  process.exit(code);
}

const registryPath = "configs/dex_registry.json";
if (!fs.existsSync(registryPath)) die(`Missing ${registryPath}`);

const raw = fs.readFileSync(registryPath, "utf8");
let entries: DexEntry[];
try {
  entries = JSON.parse(raw);
} catch (e) {
  die(`JSON parse failed: ${(e as Error).message}`);
}

if (!Array.isArray(entries)) die("Registry must be a JSON array.");

const seen = new Map<string, string>();
entries.forEach((e, i) => {
  if (typeof e?.name !== "string" || !e.name.trim()) die(`Entry[${i}] invalid name`);
  if (typeof e?.program_id !== "string") die(`Entry[${i}] missing program_id`);
  let pk: PublicKey;
  try { pk = new PublicKey(e.program_id); } catch {
    die(`Entry[${i}] invalid program_id base58: ${e.program_id}`);
  }
  const k = pk.toBase58();
  if (seen.has(k)) die(`Duplicate program_id detected at index ${i} (${e.name}) also used by ${seen.get(k)}`);
  seen.set(k, e.name);
});

const skip = process.env.SKIP_CHAIN_CHECKS === "1";
const rpc = process.env.ANCHOR_PROVIDER_URL || "https://api.mainnet-beta.solana.com";

async function main() {
  if (skip) {
    console.log("[validate_registry] SKIP_CHAIN_CHECKS=1 — structure & duplicates only. OK.");
    console.log(`[validate_registry] Entries: ${entries.length}`);
    process.exit(0);
  }
  const connection = new Connection(rpc, "confirmed");
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const pubkey = new PublicKey(e.program_id);
    const info = await connection.getAccountInfo(pubkey);
    if (!info) die(`Entry[${i}] ${e.name}: account not found on chain ${rpc}`);
    if (!info.executable) die(`Entry[${i}] ${e.name}: account exists but is NOT executable`);
  }
  console.log(`[validate_registry] OK — ${entries.length} entries are structurally valid and executable on-chain.`);
}

main().catch((e) => die((e as Error).message));
