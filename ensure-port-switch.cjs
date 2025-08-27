#!/usr/bin/env node
const fs=require('fs');
const p='exec-route-provider.cjs';
let s=fs.readFileSync(p,'utf8');
if(!/buildPortFlashLoanIxs/.test(s)){
  const ins = `
const FL=(process.env.FL_PROVIDER||"NONE").trim().toUpperCase();
if(FL==="PORT"){
  const { buildPortFlashLoanIxs } = require("./providers/port.cjs");
  const borrower = owner.publicKey;
  const amount = BigInt(process.env.FL_NOTIONAL_USDC||"10000000");
  const built = buildPortFlashLoanIxs(process.env, amount, borrower, program.programId, remainingAccounts);
  ixs.unshift(...built.preIxs);
  ixs.push(built.mainIx, ...built.postIxs);
} else if(FL==="NONE"){
} else {
  console.warn("["+FL+"] unknown provider; running as NONE.");
}
`;
  const re=/const\s+ixs\s*=\s*\[\s*\]\s*;?/;
  if(re.test(s)) s=s.replace(re, m=>m+ins);
  else {
    const alt=/let\s+ixs\s*=\s*\[\s*\]\s*;?/;
    if(alt.test(s)) s=s.replace(alt, m=>m+ins);
    else s = ins + s;
  }
  fs.writeFileSync(p,s);
  console.log('injected PORT switch');
} else {
  console.log('PORT switch present');
}
