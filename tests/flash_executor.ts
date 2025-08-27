
import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createMint, mintTo } from "@solana/spl-token";

describe('flash-executor tiered pools v3', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const wallet = provider.wallet as anchor.Wallet;
  const program = anchor.workspace.FlashExecutor as Program;

  const GLOBAL_SEED = Buffer.from('global');

  let globalPda: PublicKey;
  let mint: PublicKey;
  let poolPda: PublicKey;
  let vaultAuthority: PublicKey;
  let settlementVault: PublicKey;
  let executionVault: PublicKey;

  it('init + pool + zero-hop', async () => {
    [globalPda] = PublicKey.findProgramAddressSync([GLOBAL_SEED], program.programId);
    await program.methods.initializeGlobal(wallet.publicKey)
      .accounts({ global: globalPda, payer: wallet.publicKey, systemProgram: SystemProgram.programId })
      .rpc();

    mint = await createMint(provider.connection, wallet.payer, wallet.publicKey, null, 6);
    const poolId = new anchor.BN(1);
    [poolPda] = PublicKey.findProgramAddressSync([Buffer.from('pool'), mint.toBuffer(), Buffer.from(new Uint8Array(new BigInt64Array([BigInt(1)]).buffer))], program.programId);
    const [va] = PublicKey.findProgramAddressSync([Buffer.from('vault_auth'), poolPda.toBuffer()], program.programId);
    vaultAuthority = va;
    settlementVault = getAssociatedTokenAddressSync(mint, vaultAuthority, true);
    executionVault = getAssociatedTokenAddressSync(mint, vaultAuthority, true);

    await program.methods.createPool(
      poolId, 1, new anchor.BN(1_000_000_000), new anchor.BN(0), 50, 2, true
    ).accounts({
      global: globalPda,
      pool: poolPda,
      vaultAuthority,
      mint,
      settlementVault,
      executionVault,
      payer: wallet.publicKey,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
      owner: wallet.publicKey,
    } as any).rpc();

    await mintTo(provider.connection, wallet.payer, mint, settlementVault, wallet.payer, 10_000_000_000n);

    await program.methods.executeRoute(new anchor.BN(0), [])
      .accounts({
        global: globalPda,
        pool: poolPda,
        vaultAuthority,
        settlementVault,
        executionVault,
        caller: wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      }).rpc();
  });
});
