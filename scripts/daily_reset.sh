#!/usr/bin/env bash
set -euo pipefail
ENV_PATH="${1:-$HOME/.flash-arb/devnet.env}"
RPC="https://api.devnet.solana.com"
RAY_PROG="DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH"
RAY_POOL="EgCkhQM9zZVAk5Pvbn4ueNX6z5p18MpPQboZFzDvRk9w"
cp -f "$HOME/.flash-arb/keys/devnet-payer.json" ./phantom-owner.json
OWNER=$(solana-keygen pubkey ./phantom-owner.json)
cat > "$ENV_PATH" <<EOF
RPC=$RPC
PROGRAM=9ckBy54vd9G6FmR63Z4PoLtNq8rbtoYzhVbJGx458Kmn
GLOBAL=FjMwTsqGz5LZQSaGNWYkLZfFGWFNpFS42bZqeWQwq3Mk
POOL=GruMMnPSwG1tkR5MiZfFEAscsbzD7g6e8271zW9ji5yA
VAULT_AUTHORITY=7itZrzm5t2ZAL7hdZABrq5zBS6UrnL6qzvvJT2XHQANf
VAULT=9uabzvq4s4D76zCrrVPjp7ZXFzsFr3H2NAJBPwL9VTAV
CALLER=$OWNER
TOKEN_PROGRAM=TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
SYSVAR_RENT=SysvarRent111111111111111111111111111111111
CLMM_PROG=$RAY_PROG
CLMM_POOL=$RAY_POOL
RAY_PROG=$RAY_PROG
RAY_POOL=$RAY_POOL
EOF
ENV="$ENV_PATH" RPC="$RPC" RAY_PROG="$RAY_PROG" RAY_POOL="$RAY_POOL" node dryrun-ray-ultra.cjs || true
ENV="$ENV_PATH" node scripts/route-sanity.cjs
