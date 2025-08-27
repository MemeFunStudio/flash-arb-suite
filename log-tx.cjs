#!/usr/bin/env node
const {Connection} = require("@solana/web3.js");

(async () => {
  const sig = process.argv[2] || require('fs').existsSync(process.env.HOME+"/.flash-arb/last.sig")
    ? require('fs').readFileSync(process.env.HOME+"/.flash-arb/last.sig","utf8").trim()
    : null;

  if (!sig) {
    console.error("Usage: node log-tx.cjs <SIGNATURE>\n(or leave blank if ~/.flash-arb/last.sig exists)");
    process.exit(1);
  }

  const RPC = process.env.RPC || "https://api.devnet.solana.com";
  const cn = new Connection(RPC, "confirmed");
  const tx = await cn.getTransaction(sig, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });

  if (!tx) {
    console.error("NOT_FOUND (try again in a second) —", sig);
    process.exit(2);
  }

  const meta = tx.meta || {};
  const ok = meta.err == null;
  console.log("SIGNATURE:", sig);
  console.log("STATUS   :", ok ? "OK" : JSON.stringify(meta.err));
  if (typeof meta.computeUnitsConsumed === "number") {
    console.log("CU       :", meta.computeUnitsConsumed);
  }
  if (Array.isArray(meta.logMessages) && meta.logMessages.length) {
    console.log("---- PROGRAM LOGS ----");
    console.log(meta.logMessages.join("\n"));
  }
})();
