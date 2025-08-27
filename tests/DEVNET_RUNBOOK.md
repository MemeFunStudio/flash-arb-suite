# DEVNET RUNBOOK — flash-arb-suite (clean build → whitelist → smoke)

> Default timezone: Australia/Perth (AWST). Date prepared: 2025‑08‑19.

## 0) Prereqs
- Anchor 0.31.1, anchor-spl 0.31.1 (program-side), spl-token-2022 6.x (program-side)
- Solana CLI 1.18.x
- Node 18+ (you have v24), `yarn` or `pnpm`, and `npx` available

## 1) Program ID wiring (one source of truth)
- **lib.rs**: `declare_id!("72yWXGYaoGMrtxtwfrpwfyhJwbbtbWpGsqb3GLK3pkKh");`
- **Anchor.toml**: map `flash_executor` to the same ID under `[programs.localnet|devnet|mainnet]` (already done in this pack).

## 2) Clean build
```bash
anchor clean
anchor build -v
# IDL will land at target/idl/flash_executor.json
# So will the binary at target/deploy/flash_executor.so
```

If you see stack-size warnings, keep per-tx buffers small and avoid large local arrays in the route loop.

## 3) Choose cluster
```bash
# devnet
solana config set --url https://api.devnet.solana.com
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
# mainnet
# solana config set --url https://api.mainnet-beta.solana.com
# export ANCHOR_PROVIDER_URL=https://api.mainnet-beta.solana.com
```

## 4) Deploy (same PROGRAM_ID)
```bash
# Ensure the keypair matches the upgrade authority you want.
anchor deploy
```

## 5) Registry hygiene (strict, no fake data)
```bash
# Validate structure & on-chain executable bit
npx tsx scripts/validate_registry.ts
# On devnet (where some DEXes aren't deployed), skip chain checks:
SKIP_CHAIN_CHECKS=1 npx tsx scripts/validate_registry.ts
```

## 6) Push allowlist (use your existing scripts/whitelist.ts)
```bash
# Dry run first
DRY_RUN=1 npx tsx scripts/whitelist.ts
# Then live
npx tsx scripts/whitelist.ts
```

### Notes
- Keep `configs/dex_registry.json` as the only place you add/remove DEX program IDs.
- On devnet, not all mainnet DEX program IDs exist; your whitelist script may need `SKIP_CHAIN_CHECKS=1` to load, but the actual route CPI will still fail unless the target program exists. That’s expected for devnet.

## 7) Optional: seed devnet tokens for hook testing
```bash
# Mints two Token‑2022 mints and credits your owner wallet
npx tsx scripts/bootstrap_devnet.ts
```

## 8) What remains to wire on-chain
- Add the **withdraw/repay/sweep** Token‑2022 CPIs around your route loop. Prefer `anchor_spl::token_interface` so the same code path works for both Token‑2022 and classic SPL Token.
- Keep all owner-only guards and length caps; no realloc; no giant stack frames.

### Minimal pattern (pseudo‑Rust)
```rust
use anchor_spl::token_interface as splif;

fn transfer_checked<'info>(
    token_program: AccountInfo<'info>,
    from: AccountInfo<'info>,
    to: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    amount: u64,
    decimals: u8,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let cpi_accounts = splif::TransferChecked {
        from,
        mint,
        to,
        authority,
    };
    let cpi_ctx = CpiContext::new(token_program, cpi_accounts).with_signer(signer_seeds);
    splif::transfer_checked(cpi_ctx, amount, decimals)
}
```

## 9) Mainnet checklist (before any live routes)
- `npx tsx scripts/validate_registry.ts` (no SKIP flag) must pass.
- Program’s `owner` is the wallet you control; revoke anyone else.
- Start with **read‑only** dry‑runs off‑chain to build ix metas; then submit a tiny dust transfer via a known-safe CPI target to verify metas order; only then do full token flows.

---

### Common pitfalls & fixes
- **Mismatched program IDs**: ensure `Anchor.toml` and `declare_id!` match **exactly** the current ID `72yW…pkKh`.
- **Devnet DEXes missing**: use `SKIP_CHAIN_CHECKS=1` for validation; expect route CPI to fail unless you use devnet-native program IDs.
- **Rust nightly sneaking in**: repo’s `rust-toolchain.toml` should be set to `stable`; don’t override in env.
