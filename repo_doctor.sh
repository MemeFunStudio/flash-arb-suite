#!/usr/bin/env bash
# Repo Doctor — finds common causes of `os error 20` in Anchor workspaces
set -euo pipefail

echo "== Repo Doctor ====================================================="
echo "PWD: $(pwd)"
echo

# 1) Show expected paths & their types
paths=(
  "Cargo.toml"
  "Anchor.toml"
  "programs"
  "programs/flash_executor"
  "programs/flash_executor/src"
  "target"
  ".anchor"
)
for p in "${paths[@]}"; do
  if [ -e "$p" ]; then
    if [ -d "$p" ]; then
      echo "[OK]  dir : $p"
    else
      echo "[!!] file: $p   (expected a directory?)"
    fi
  else
    echo "[??] miss: $p"
  fi
done
echo

# 2) Quick grep checks
if [ -f Cargo.toml ]; then
  echo "---- Cargo.toml (root) ----"
  grep -nE '^(\[workspace\]|members|\[profile\.release\]|overflow-checks)' Cargo.toml || true
  echo
fi

# 3) Suggested fixes (dry-run)
echo "== Suggested Fixes (manual) =="
echo "- If you see '[!!] file: programs', rename it:   mv programs programs.bak && mkdir -p programs"
echo "- If you see '[!!] file: target', remove it:     rm -f target"
echo "- Ensure the program dir exists:                  mkdir -p programs/flash_executor/src"
echo "- Re-run: anchor clean && anchor build -v"
echo "===================================================================="
