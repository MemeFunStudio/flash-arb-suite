#!/usr/bin/env bash
set -euo pipefail
set -a
source "./../env/devnet.env"
set +a
for k in PROGRAM GLOBAL POOL VAPDA VATA USDC_MINT RAY_PROG RAY_POOL; do printf "%s=%s\n" "" ""; done
