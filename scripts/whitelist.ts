/**
 * scripts/whitelist.ts
 * Pushes configs/dex_registry.json entries into the on-chain allowlist by
 * calling your program's `set_whitelist(program_id: Pubkey, enabled: bool)`.
 *
 * Env:
 *  - ANCHOR_PROVIDER_URL: RPC (default https://api.devnet.solana.com)
 *  - ANCHOR_WALLET: path to payer keypair (default ~/.config/solana/id.json)
 *  - PROGRAM_ID: override program id (else uses IDL.metadata.address)
 *  - DEX_REGISTRY: path to registry JSON (default ../configs/dex_registry.json)
 *  - GLOBAL_SEED: PDA seed for `global` (default "global")
 */
import * as fs from "fs";
import * as path from "path";
import os from "os";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, Commitment } from "@solana/web3.js";
import { IDL as FlashExecutorIDL } from "../target/types/flash_executor";

type DexEntry = { name: string; program_id: string; enabled?: boolean };

function loadKeypair(kpPath: string): Keypair {
  const raw = fs.readFileSync(kpPath, "utf8");
  const secret = JSON.parse(raw);
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function main() {
  const REG_PATH =
    process.env.DEX_REGISTRY ?? path.resolve(__dirname, "..", "configs", "dex_registry.json");
  const RPC = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
  const COMMITMENT: Commitment = "confirmed";
  const WALLET_PATH =
    process.env.ANCHOR_WALLET ?? path.resolve(os.homedir(), ".config", "solana", "id.json");
  const programIdStr =
    process.env.PROGRAM_ID || (FlashExecutorIDL as any)?.metadata?.address;
  if (!programIdStr) {
    throw new Error("PROGRAM_ID not provided and IDL.metadata.address missing");
  }
  const programId = new PublicKey(programIdStr);

  const payer = loadKeypair(WALLET_PATH);
  const wallet = new anchor.Wallet(payer);
  const connection = new anchor.web3.Connection(RPC, COMMITMENT);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: COMMITMENT,
    preflightCommitment: COMMITMENT,
  });
  anchor.setProvider(provider);
  const program = new anchor.Program(FlashExecutorIDL as anchor.Idl, programId, provider);

  const seed = process.env.GLOBAL_SEED ?? "global";
  const [globalPda] = PublicKey.findProgramAddressSync([Buffer.from(seed)], programId);
  console.log("Program ID:", programId.toBase58());
  console.log("Global PDA:", globalPda.toBase58());
  console.log("Registry:", REG_PATH);
  console.log("Wallet:", wallet.publicKey.toBase58());

  const entries: DexEntry[] = JSON.parse(fs.readFileSync(REG_PATH, "utf8"));
  let ok = 0, fail = 0;

  for (const e of entries) {
    try {
      const pid = new PublicKey(e.program_id);
      const enabled = e.enabled ?? true;
      console.log(`→ set_whitelist(${e.name}, ${pid.toBase58()}, enabled=${enabled})`);

      // NOTE: If your instruction signature is different, tweak this builder call.
      const txSig = await (program.methods as any)
        .setWhitelist(pid, enabled)
        .accounts({
          global: globalPda,
          owner: wallet.publicKey,
        })
        .rpc();
      console.log("   ✓ tx:", txSig);
      ok++;
    } catch (err) {
      console.error("   ✗ error:", (err as Error).message);
      fail++;
    }
  }
  console.log(`Done. ${ok} succeeded, ${fail} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
