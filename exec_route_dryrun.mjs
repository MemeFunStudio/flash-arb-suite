// exec_route_dryrun.mjs (whitespace-tolerant)
import { readFileSync } from "fs";
import {
  Connection, Keypair, PublicKey, Transaction, TransactionInstruction, clusterApiUrl,
} from "@solana/web3.js";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { BorshInstructionCoder } from "@coral-xyz/anchor";
import BN from "bn.js";

const CLUSTER = process.env.CLUSTER || "devnet";
const PROGRAM_ID = new PublicKey("9ckBy54vd9G6FmR63Z4PoLtNq8rbtoYzhVbJGx458Kmn");

const env = (k) => (process.env[k] || "").trim();

function mustPubkey(name, v) {
  try { return new PublicKey(v); }
  catch { throw new Error(`Invalid ${name}: ${v || "undefined"}`); }
}

function loadOwner() {
  const raw = JSON.parse(readFileSync("global.json", "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function main() {
  const MINT = mustPubkey("MINT", env("MINT"));
  const VAULT_AUTH = mustPubkey("VAULT_AUTH", env("VAULT_AUTH"));
  const GLOBAL = mustPubkey("GLOBAL", env("GLOBAL"));
  const principalBN = new BN(env("PRINCIPAL") || "0", 10);

  const owner = loadOwner();

  console.log("Inputs:");
  console.log("  MINT        :", MINT.toBase58());
  console.log("  VAULT_AUTH  :", VAULT_AUTH.toBase58());
  console.log("  GLOBAL key  :", GLOBAL.toBase58());
  console.log("  OWNER (sig) :", owner.publicKey.toBase58());
  console.log("  principal   :", principalBN.toString(10));
  console.log("");

  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), MINT.toBuffer(), owner.publicKey.toBuffer()],
    PROGRAM_ID
  );

  const vaultAta = await getAssociatedTokenAddress(MINT, VAULT_AUTH, true, TOKEN_PROGRAM_ID);

  console.log("Derived addresses:");
  console.log("  Pool PDA    :", poolPda.toBase58());
  console.log("  Vault ATA   :", vaultAta.toBase58());
  console.log("");

  const idl = JSON.parse(readFileSync("idl/flash_executor.json", "utf8"));
  const coder = new BorshInstructionCoder(idl);

  const data = coder.encode("execute_route", { principal: principalBN, route: [] });

  const keys = [
    { pubkey: GLOBAL,      isSigner: false, isWritable: true  },
    { pubkey: poolPda,     isSigner: false, isWritable: true  },
    { pubkey: VAULT_AUTH,  isSigner: false, isWritable: false },
    { pubkey: vaultAta,    isSigner: false, isWritable: true  },
    { pubkey: owner.publicKey, isSigner: true, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  const ix = new TransactionInstruction({ programId: PROGRAM_ID, keys, data });
  const conn = new Connection(CLUSTER === "devnet" ? clusterApiUrl("devnet") : clusterApiUrl(CLUSTER), { commitment: "confirmed" });

  const tx = new Transaction().add(ix);
  tx.feePayer = owner.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash("finalized")).blockhash;
  tx.sign(owner);

  console.log("Simulating execute_route dry-run…");
  const sim = await conn.simulateTransaction(tx, { sigVerify: true, replaceRecentBlockhash: true });
  console.log("--- Simulation result ---");
  console.log(JSON.stringify(sim.value, null, 2));

  if (sim.value.logs) {
    console.log("\nResolved accounts:");
    console.log("  Program     :", PROGRAM_ID.toBase58());
    console.log("  Global      :", GLOBAL.toBase58());
    console.log("  Pool PDA    :", poolPda.toBase58());
    console.log("  Vault Auth  :", VAULT_AUTH.toBase58());
    console.log("  Vault ATA   :", vaultAta.toBase58());
    console.log("  Caller      :", owner.publicKey.toBase58());
  }
}

main().catch((e) => { console.error(e.stack || e); process.exit(1); });
