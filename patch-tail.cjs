#!/usr/bin/env node
const fs=require('fs');
let s=fs.readFileSync('exec-route-provider.cjs','utf8');

// replace tail starting at the build-program marker
const reTail=/(\/\/ ---------- build program instruction ----------)[\s\S]*$/;
const newTail=`$1
const disc = crypto.createHash("sha256").update("global:"+ixDef.name).digest().slice(0,8);
const data = Buffer.concat([disc, Buffer.alloc(8,0), Buffer.alloc(4,0)]);
const ordered = remaining;
const execIx = new TransactionInstruction({
  programId: PROGRAM,
  keys: [...base, ...ordered],
  data,
});

(async () => {
  const {Connection,Transaction} = require("@solana/web3.js");
  const cn = new Connection(RPC, "confirmed");
  const tx = new Transaction();
  preInstrs.forEach(ix => tx.add(ix));
  tx.add(execIx);
  postInstrs.forEach(ix => tx.add(ix));
  tx.feePayer = payer.publicKey;
  const { blockhash } = await cn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.sign(payer);
  const sig = await cn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  console.log("SENT:", sig);
  console.log("Explorer: https://explorer.solana.com/tx/"+sig+"?cluster=devnet");
})().catch(e => {
  console.error("send error:", e.message);
  if (e.transactionLogs) console.error(e.transactionLogs.join("\n"));
  process.exit(1);
});
`;

if(!reTail.test(s)) throw new Error("build-program marker not found");
s=s.replace(reTail,newTail);

// ensure single shebang
s=s.replace(/\r/g,'');
s=s.replace(/^\s*#!.*node.*\n?/mg,'');
s='#!/usr/bin/env node\n'+s;

// drop any standalone ')}' lines that may remain
s=s.replace(/^\s*\)\s*\}\s*;?\s*$/mg,'');

fs.writeFileSync('exec-route-provider.cjs',s);
console.log('TAIL_REPLACED');
