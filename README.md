
# Flash Arb Suite (Tiered Pools, Owner/Executor Guards)

- Anchor 0.31.x, Solana 1.18.x, Rust 1.82.0 (pinned)
- Owner-only governance + executors allowlist (for route execution & sweeping)
- Per-token `TokenPool` (supports multiple pools per same mint via `pool_id`)
- Guarded multi-step CPI route (program whitelist, per-trade cap, max hops, profit invariant)
- Program-owned vault authority (PDA) with settlement & execution ATAs
- Scripts to whitelist verified DEX program IDs (devnet/mainnet sets)

## Quick Start (devnet)
```bash
# 0) toolchains
rustup toolchain install 1.82.0
anchor --version   # 0.31.1
solana --version   # 1.18.x validator recommended (cli 2.x ok)

# 1) generate program id
solana-keygen new -o target/deploy/flash_executor-keypair.json -s
solana address -k target/deploy/flash_executor-keypair.json
# put it into programs/flash_executor/src/lib.rs (declare_id!) and Anchor.toml
anchor keys sync

# 2) build & deploy
anchor build
anchor deploy --provider.cluster devnet

# 3) whitelist common DEXes, set treasury, add yourself as executor
CLUSTER=devnet ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=~/.config/solana/id.json yarn whitelist
```

See `scripts/whitelist.ts` for the program IDs that get added.
