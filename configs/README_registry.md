# configs/dex_registry.json

This file feeds the on-chain allowlist via `scripts/whitelist.ts`.
Start with a **strict, verified** set. Example entry:

```json
[
  {
    "name": "Orca Whirlpool",
    "program_id": "REPLACE_WITH_VERIFIED_PROGRAM_ID"
  }
]
```

## Workflow

1. Edit `configs/dex_registry.json` with verified program IDs you intend to allow.
2. Run validation:

   ```bash
   npx tsx scripts/validate_registry.ts
   ```

3. If OK, push to chain:

   ```bash
   npx tsx scripts/whitelist.ts
   ```

> Generated: 2025-08-19
