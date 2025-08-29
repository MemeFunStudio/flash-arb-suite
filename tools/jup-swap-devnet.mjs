import {Connection, Keypair, VersionedTransaction} from "@solana/web3.js";
import fs from "fs";

const RPC = process.env.RPC || "https://api.devnet.solana.com";
const KEYPAIR_PATH = process.env.SOLANA_KEYPAIR;
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf8"))));
const conn = new Connection(RPC, "confirmed");

const INPUT_MINT = "So11111111111111111111111111111111111111112";
const OUTPUT_MINT = "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr";
const AMOUNT_IN_LAMPORTS = 10000000;
const SLIPPAGE_BPS = 50;

const quoteUrl = new URL("https://quote-api.jup.ag/v6/quote");
quoteUrl.searchParams.set("inputMint", INPUT_MINT);
quoteUrl.searchParams.set("outputMint", OUTPUT_MINT);
quoteUrl.searchParams.set("amount", String(AMOUNT_IN_LAMPORTS));
quoteUrl.searchParams.set("slippageBps", String(SLIPPAGE_BPS));
quoteUrl.searchParams.set("swapMode", "ExactIn");
quoteUrl.searchParams.set("onlyDirectRoutes", "false");
quoteUrl.searchParams.set("asLegacyTransaction", "false");

const qres = await fetch(quoteUrl, {headers: {"accept":"application/json"}});
if(!qres.ok){ const t=await qres.text(); throw new Error("quote http "+qres.status+" "+t); }
const quote = await qres.json();

const sres = await fetch("https://quote-api.jup.ag/v6/swap", {
  method:"POST",
  headers: {"content-type":"application/json"},
  body: JSON.stringify({
    userPublicKey: payer.publicKey.toBase58(),
    quoteResponse: quote,
    wrapAndUnwrapSol: true,
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: "auto"
  })
});
if(!sres.ok){ const t=await sres.text(); throw new Error("swap http "+sres.status+" "+t); }

const sj = await sres.json();
const tx = VersionedTransaction.deserialize(Buffer.from(sj.swapTransaction, "base64"));
tx.sign([payer]);
const sig = await conn.sendTransaction(tx, {skipPreflight:false, maxRetries:3});
await conn.confirmTransaction(sig, "confirmed");
console.log("SIGNATURE="+sig);
console.log("EXPLORER=https://explorer.solana.com/tx/"+sig+"?cluster=devnet");
