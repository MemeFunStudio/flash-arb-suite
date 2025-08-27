// Bootstrap devnet convenience: create two Token-2022 mints and seed ATAs for your owner wallet.
// Usage:
//   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com npx tsx scripts/bootstrap_devnet.ts
//
import { Connection, Keypair, PublicKey, SystemProgram, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import fs from "fs";
import os from "os";
import path from "path";

function loadKeypair(file: string): Keypair {
  const full = file.replace("~", os.homedir());
  const secret = JSON.parse(fs.readFileSync(full, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function main() {
  const rpc = process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com";
  const kpPath = process.env.ANCHOR_WALLET || path.join(os.homedir(), ".config/solana/id.json");
  const owner = loadKeypair(kpPath);
  const conn = new Connection(rpc, "confirmed");

  console.log(`[bootstrap_devnet] Using wallet ${owner.publicKey.toBase58()} on ${rpc}`);

  // Try airdrop (devnet only). Ignore failure.
  try {
    const sig = await conn.requestAirdrop(owner.publicKey, 2e9);
    await conn.confirmTransaction(sig, "confirmed");
    console.log("[bootstrap_devnet] Airdropped 2 SOL (devnet).");
  } catch {}

  // Create two Token-2022 mints (6 decimals)
  const mintA = await createMint(conn, owner, owner.publicKey, null, 6, undefined, undefined, TOKEN_2022_PROGRAM_ID);
  const mintB = await createMint(conn, owner, owner.publicKey, null, 6, undefined, undefined, TOKEN_2022_PROGRAM_ID);
  console.log(`[bootstrap_devnet] MintA: ${mintA.toBase58()}`);
  console.log(`[bootstrap_devnet] MintB: ${mintB.toBase58()}`);

  // Owner ATAs
  const ataA = await getOrCreateAssociatedTokenAccount(conn, owner, mintA, owner.publicKey, true, "confirmed", undefined, TOKEN_2022_PROGRAM_ID);
  const ataB = await getOrCreateAssociatedTokenAccount(conn, owner, mintB, owner.publicKey, true, "confirmed", undefined, TOKEN_2022_PROGRAM_ID);

  // Seed balances
  await mintTo(conn, owner, mintA, ataA.address, owner, 1_000_000_000, [], undefined, TOKEN_2022_PROGRAM_ID); // 1,000 A (6dp)
  await mintTo(conn, owner, mintB, ataB.address, owner, 1_000_000_000, [], undefined, TOKEN_2022_PROGRAM_ID); // 1,000 B (6dp)

  console.log(`[bootstrap_devnet] ATAs:`);
  console.log(`  A -> ${ataA.address.toBase58()}`);
  console.log(`  B -> ${ataB.address.toBase58()}`);
  console.log("[bootstrap_devnet] Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
