#!/usr/bin/env node
const fs=require('fs');
let s=fs.readFileSync('exec-route-provider.cjs','utf8');

const re=/(\/\/ ---------- provider pre\/post stubs ----------)[\s\S]*?(\/\/ ---------- build program instruction ----------)/;
const block=`$1
const provider = (process.env.FL_PROVIDER || "NONE").toUpperCase();
const preInstrs = [];
const postInstrs = [];
if (provider === "NONE") {
} else if (provider === "MANGO") {
  console.warn("[MANGO] provider stubs not yet wired; running without pre/post ixs.");
} else if (provider === "PORT") {
  try {
    const { buildPortFlashLoanIxs } = require("./providers/port.cjs");
    const cfg = {
      PROGRAM_ID: process.env.PORT_PROG,
      LENDING_MARKET: process.env.PORT_LENDING_MARKET,
      USDC_RESERVE: process.env.PORT_USDC_RESERVE,
      USDC_LIQ_SUPPLY: process.env.PORT_USDC_LIQ_SUPPLY,
      USDC_FEE_RECEIVER: process.env.PORT_USDC_FEE_RECEIVER || "",
      HOST_FEE: process.env.PORT_USDC_HOST_FEE || ""
    };
    if (buildPortFlashLoanIxs) {
      const p = payer.publicKey;
      const built = buildPortFlashLoanIxs(cfg, p);
      if (built && Array.isArray(built.pre)) preInstrs.push(...built.pre);
      if (built && Array.isArray(built.post)) postInstrs.push(...built.post);
    }
  } catch (e) {
    console.warn("[PORT] provider wiring failed:", e.message);
  }
} else {
  console.warn("[" + provider + "] unknown provider; running as NONE.");
}
$2`;
if(!re.test(s)) { throw new Error("marker not found"); }
s=s.replace(re,block);

// ensure single shebang at top
s=s.replace(/\r/g,'');
s=s.replace(/^\s*#!.*node.*\n?/mg,'');
s='#!/usr/bin/env node\n'+s;

// balance check; auto-append missing closers if any
const map={'{':'}','(' :')','[':']'};
function needs(text){
  let st=[];
  for(const ch of text){
    if(map[ch]) st.push(ch);
    else if('}])'.includes(ch)){ if(st.length && map[st.at(-1)]===ch) st.pop(); }
  }
  let need=''; while(st.length) need+=map[st.pop()];
  return need;
}
const add=needs(s);
if(add) s+=('\n'+add+'\n');

fs.writeFileSync('exec-route-provider.cjs',s);
console.log('PATCHED');
