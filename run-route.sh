#!/usr/bin/env bash
set -euo pipefail

# RPC (your Helius devnet unless overridden)
: "${RPC:=https://devnet.helius-rpc.com/?api-key=37658bc7-5bd1-47f4-ad34-56b7a125011d}"
export RPC

# Load provider.env if present (FL_PROVIDER, MANGO_* / PORT_*, FLASH_LOAN_AMOUNT, etc.)
if [[ -f ./provider.env ]]; then
  set -a; source ./provider.env; set +a
fi

# Sanity: tell you which provider you'll use
./check-provider-env.cjs

# Run the route driver and capture the signature
mkdir -p ~/.flash-arb
LOG_FILE="$(mktemp)"
node ./exec-route-provider.cjs | tee "$LOG_FILE"

SIG="$(sed -n 's/^SENT: //p' "$LOG_FILE" | tail -n1)"
rm -f "$LOG_FILE"

if [[ -z "${SIG:-}" ]]; then
  echo "Could not capture signature from exec-route-provider.cjs output." >&2
  exit 3
fi

echo "$SIG" > ~/.flash-arb/last.sig
echo "Explorer: https://explorer.solana.com/tx/$SIG?cluster=devnet"

# Confirm with CLI (nice rich decode)
solana confirm "$SIG" --url "$RPC" -v || true

# Always print logs via the robust viewer
node ./log-tx.cjs "$SIG"
