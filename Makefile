SHELL := /bin/bash
.DEFAULT_GOAL := dryrun

required = PROGRAM GLOBAL POOL VAPDA VATA USDC_MINT RAY_PROG RAY_POOL

check-env:
	@ok=0; for k in $(required); do if [ -z "$${!k}" ]; then echo "Missing $$k"; ok=1; fi; done; exit $$ok

dryrun: check-env
	@RPC=$${RPC:-https://api.devnet.solana.com} node dryrun-ray.cjs
