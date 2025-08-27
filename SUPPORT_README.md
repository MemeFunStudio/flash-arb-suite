# Support Pack (scripts + configs)

Files included:

- `scripts/whitelist.ts` — pushes allowlist entries on-chain.
- `scripts/validate_registry.ts` — validates the registry file before pushing.
- `configs/dex_registry.json` — your editable allowlist (starts empty).
- `configs/README_registry.md` — short guide.

## Install deps (once)

At the repo root:

```bash
npm i -D tsx typescript
npm i @coral-xyz/anchor
```

## Typical flow

```bash
# 1) add verified entries
vim configs/dex_registry.json

# 2) sanity check the registry
npx tsx scripts/validate_registry.ts

# 3) whitelist on chain
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
export ANCHOR_WALLET=~/.config/solana/id.json
npx tsx scripts/whitelist.ts
```
