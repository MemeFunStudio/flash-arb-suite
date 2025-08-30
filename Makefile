ENV?=$(HOME)/.flash-arb/devnet.env

.PHONY: daily-reset pin-ray-extras sanity check list-candidates use-candidate

daily-reset:
	bash scripts/daily_reset.sh "$(ENV)"

pin-ray-extras:
	RPC=$$(awk -F= '/^RPC=/{print $$2}' "$(ENV)") RAY_PROG=$$(awk -F= '/^RAY_PROG=/{print $$2}' "$(ENV)") RAY_POOL=$$(awk -F= '/^RAY_POOL=/{print $$2}' "$(ENV)") ENV="$(ENV)" RPC="$$RPC" RAY_PROG="$$RAY_PROG" RAY_POOL="$$RAY_POOL" node dryrun-ray-ultra.cjs

sanity:
	ENV="$(ENV)" node scripts/route-sanity.cjs

list-candidates:
	RPC=$$(awk -F= '/^RPC=/{print $$2}' "$(ENV)") RAY_PROG=$$(awk -F= '/^RAY_PROG=/{print $$2}' "$(ENV)") LIMIT=150 RPC="$$RPC" RAY_PROG="$$RAY_PROG" node scripts/rank-wsol-clmm.cjs

use-candidate:
	test -n "$(C)"
	perl -pi -e "s|^CLMM_POOL=.*$$|CLMM_POOL=$(C)|" "$(ENV)"
	perl -pi -e "s|^RAY_POOL=.*$$|RAY_POOL=$(C)|" "$(ENV)"
	RPC=$$(awk -F= '/^RPC=/{print $$2}' "$(ENV)") RAY_PROG=$$(awk -F= '/^RAY_PROG=/{print $$2}' "$(ENV)") ENV="$(ENV)" RPC="$$RPC" RAY_PROG="$$RAY_PROG" RAY_POOL="$(C)" node dryrun-ray-ultra.cjs
	make sanity

check:
	git rev-parse --short HEAD
	test -f exec-route-provider.cjs && echo ok:exec-route-provider.cjs
	test -f dryrun-ray-ultra.cjs && echo ok:dryrun-ray-ultra.cjs
	test -f idl/flash_executor.json && echo ok:idl
	test -f programs/flash_executor/src/lib.rs && echo ok:lib
	grep -E '^(PROGRAM|GLOBAL|POOL|VAULT_AUTHORITY|VAULT|CALLER|CLMM_PROG|CLMM_POOL|RAY_PROG|RAY_POOL|EXTRA_[0-9]+)=' "$(ENV)"
ENV?=$(HOME)/.flash-arb/devnet.env

.PHONY: list-candidates use-candidate blast sanity

list-candidates:
	RPCS_FILE=$(HOME)/.flash-arb/rpcs.devnet LIMIT=60 PAGES=2 RAY_PROG=$(shell awk -F= '/^RAY_PROG=/{print $$2}' "$(ENV)") ORCA_PROG=$(shell awk -F= '/^ORCA_PROG=/{print $$2}' "$(ENV)") node scripts/auto-find-swap.cjs | tee /tmp/auto_found.json

use-candidate:
	test -s /tmp/auto_found.json
	test -n "$(shell jq -r '.pool//empty' /tmp/auto_found.json)"
	POOL=$(shell jq -r '.pool' /tmp/auto_found.json); \
	perl -pi -e "s|^CLMM_POOL=.*$$|CLMM_POOL=$$POOL|" "$(ENV)"; \
	perl -pi -e "s|^RAY_POOL=.*$$|RAY_POOL=$$POOL|" "$(ENV)"; \
	echo $$POOL

blast:
	RPC_SEND=$(shell awk -F= '/^RPC=/{print $$2}' "$(ENV)") ; \
	SIG=$$(jq -r '.tx//empty' /tmp/auto_found.json); \
	test -n "$$SIG"; \
	ENV="$(ENV)" RPC="$$RPC_SEND" TX="$$SIG" node scripts/swap-from-sig.cjs

sanity:
	ENV="$(ENV)" node scripts/route-sanity.cjs

phoenix-smoke:
	@(set -e;
	RPC=$$(awk -F= '/^RPC=/{print $$2}' "$$HOME/.flash-arb/devnet.env" | tail -1);
	PHX_PROG=PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY;
	PHX_MARKET=$$(RPC="$$RPC" PHX_PROG="$$PHX_PROG" node scripts/probe-phoenix-market.cjs);
	test -n "$$PHX_MARKET" -a "$$PHX_MARKET" != "NONE";
	ENV="$$HOME/.flash-arb/devnet.env" RPC="$$RPC" PHX_PROG="$$PHX_PROG" PHX_MARKET="$$PHX_MARKET" node scripts/phoenix_smoke.cjs;
	)
phoenix-smoke:
	@(set -e; \
	RPC=$$(awk -F= '/^RPC=/{print $$2}' "$$HOME/.flash-arb/devnet.env" | tail -1); \
	PHX_PROG=PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY; \
	PHX_MARKET=$$(RPC="$$RPC" PHX_PROG="$$PHX_PROG" node scripts/probe-phoenix-market.cjs); \
	test -n "$$PHX_MARKET" -a "$$PHX_MARKET" != "NONE"; \
	PROG="$$PHX_PROG" TARGET="$$PHX_MARKET" RPC="$$RPC" node scripts/memo_smoke.cjs; \
	)
openbook-smoke:
	@(set -e; \
	RPC=$$(awk -F= '/^RPC=/{print $$2}' "$$HOME/.flash-arb/devnet.env" | tail -1); \
	OB_PROG=$$(awk -F= '/^OB_PROG=/{print $$2}' "$$HOME/.flash-arb/devnet.env"); \
	[ -n "$$OB_PROG" ] || OB_PROG=9xQeWvG816bUx9EPjHmaT23G7jbbRE5A2jVvvgA7VQJ; \
	TARGET=$$(RPC="$$RPC" PROG="$$OB_PROG" node scripts/probe-coaccount.cjs); \
	test -n "$$TARGET" -a "$$TARGET" != "NONE"; \
	PROG="$$OB_PROG" TARGET="$$TARGET" RPC="$$RPC" node scripts/memo_smoke.cjs; \
	)
meteora-smoke:
	@(set -e; \
	RPC=$$(awk -F= '/^RPC=/{print $$2}' "$$HOME/.flash-arb/devnet.env" | tail -1); \
	DLMM_PROG=$$(awk -F= '/^DLMM_PROG=/{print $$2}' "$$HOME/.flash-arb/devnet.env"); \
	test -n "$$DLMM_PROG"; \
	TARGET=$$(RPC="$$RPC" PROG="$$DLMM_PROG" node scripts/probe-coaccount.cjs); \
	test -n "$$TARGET" -a "$$TARGET" != "NONE"; \
	PROG="$$DLMM_PROG" TARGET="$$TARGET" RPC="$$RPC" node scripts/memo_smoke.cjs; \
	)
raydium-smoke:
	@(set -e; \
	RPC=$$(awk -F= '/^RPC=/{print $$2}' "$$HOME/.flash-arb/devnet.env" | tail -1); \
	RAY_PROG=$$(awk -F= '/^RAY_PROG=/{print $$2}' "$$HOME/.flash-arb/devnet.env"); \
	RAY_POOL=$$(awk -F= '/^RAY_POOL=/{print $$2}' "$$HOME/.flash-arb/devnet.env"); \
	test -n "$$RAY_PROG" -a -n "$$RAY_POOL"; \
	PROG="$$RAY_PROG" TARGET="$$RAY_POOL" RPC="$$RPC" node scripts/memo_smoke.cjs; \
	)

phoenix-smoke:
	@(set -e; RPC=$$(awk -F= '/^RPC=/{print $$2}' "$$HOME/.flash-arb/devnet.env" | tail -1); PHX_PROG=PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY; RPC="$$RPC" PROG="$$PHX_PROG" node scripts/send-memo.cjs)

raydium-smoke:
	@(set -e; RPC=$$(awk -F= '/^RPC=/{print $$2}' "$$HOME/.flash-arb/devnet.env" | tail -1); RAY_PROG=$$(awk -F= '/^RAY_PROG=/{print $$2}' "$$HOME/.flash-arb/devnet.env"); test -n "$$RAY_PROG"; RPC="$$RPC" PROG="$$RAY_PROG" node scripts/send-memo.cjs)

openbook-smoke:
	@(set -e; RPC=$$(awk -F= '/^RPC=/{print $$2}' "$$HOME/.flash-arb/devnet.env" | tail -1); OB_PROG=$$(awk -F= '/^OB_PROG=/{print $$2}' "$$HOME/.flash-arb/devnet.env"); test -n "$$OB_PROG"; RPC="$$RPC" PROG="$$OB_PROG" node scripts/send-memo.cjs)

meteora-smoke:
	@(set -e; RPC=$$(awk -F= '/^RPC=/{print $$2}' "$$HOME/.flash-arb/devnet.env" | tail -1); DLMM_PROG=$$(awk -F= '/^DLMM_PROG=/{print $$2}' "$$HOME/.flash-arb/devnet.env"); test -n "$$DLMM_PROG"; RPC="$$RPC" PROG="$$DLMM_PROG" node scripts/send-memo.cjs)

generic-smoke:
	@(set -e; test -n "$(PROG)"; RPC=$$(awk -F= '/^RPC=/{print $$2}' "$$HOME/.flash-arb/devnet.env" | tail -1); RPC="$$RPC" PROG="$(PROG)" node scripts/send-memo.cjs)
openbook-smoke:
	@(set -e; OB_PROG=$$(awk -F= '/^OB_PROG=/{print $$2}' "$$HOME/.flash-arb/devnet.env"); test -n "$$OB_PROG" || { echo "skip: OB_PROG not set"; exit 0; }; RPC=$$(awk -F= '/^RPC=/{print $$2}' "$$HOME/.flash-arb/devnet.env" | tail -1); RPC="$$RPC" PROG="$$OB_PROG" node scripts/send-memo.cjs)

meteora-smoke:
	@(set -e; DLMM_PROG=$$(awk -F= '/^DLMM_PROG=/{print $$2}' "$$HOME/.flash-arb/devnet.env"); test -n "$$DLMM_PROG" || { echo "skip: DLMM_PROG not set"; exit 0; }; RPC=$$(awk -F= '/^RPC=/{print $$2}' "$$HOME/.flash-arb/devnet.env" | tail -1); RPC="$$RPC" PROG="$$DLMM_PROG" node scripts/send-memo.cjs)

dex-smoke-all:
	@$(MAKE) phoenix-smoke
	@$(MAKE) raydium-smoke
	@$(MAKE) openbook-smoke
	@$(MAKE) meteora-smoke

generic-smoke:
	@(set -e; \
	RPC=$$(awk -F= '/^RPC=/{print $$2}' "$$HOME/.flash-arb/devnet.env" | tail -1); \
	test -n "$(PROG)"; \
	ENV="$$HOME/.flash-arb/devnet.env" RPC="$$RPC" PROG="$(PROG)" node scripts/send-memo.cjs; \
	)
generic-smoke:
	@(set -e; \
	RPC=$$(awk -F= '/^RPC=/{print $$2}' "$$HOME/.flash-arb/devnet.env" | tail -1); \
	test -n "$(PROG)"; \
	ENV="$$HOME/.flash-arb/devnet.env" RPC="$$RPC" PROG="$(PROG)" node scripts/send-memo.cjs; \
	)
