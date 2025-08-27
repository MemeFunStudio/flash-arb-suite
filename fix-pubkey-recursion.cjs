const fs=require('fs'); const f='exec-route-provider.cjs';
let s=fs.readFileSync(f,'utf8');
s = s.replace(/function __toPk\([\s\S]*?\}\n/,'function __toPk(x){ const {PublicKey}=require("@solana/web3.js"); const v=(x==null?"":String(x)).trim(); if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)){ throw new Error("Bad pubkey: "+JSON.stringify(x)); } return new PublicKey(v); }\n');
fs.writeFileSync(f,s); console.log('fixed __toPk implementation');
