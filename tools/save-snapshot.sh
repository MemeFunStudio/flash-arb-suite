#!/usr/bin/env bash
set -e
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p ~/.flash-arb/snapshots
SIG="$1"
SNAP=~/.flash-arb/snapshots/devnet-run-$STAMP.tsv
printf "PROGRAM\t%s\nGLOBAL_ADDR\t%s\nPOOL_ADDR\t%s\nVAULT_AUTH\t%s\nVAULT\t%s\nUSDC_DEV\t%s\nLAST_SIG\t%s\n" \
 "${PROGRAM:-}" "${GLOBAL_ADDR:-}" "${POOL_ADDR:-}" "${VAULT_AUTH:-}" "${VAULT:-}" "${USDC_DEV:-}" "${SIG:-}" > "$SNAP"
echo "$SNAP"
