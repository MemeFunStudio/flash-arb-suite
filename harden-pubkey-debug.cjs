const fs=require('fs'); const f='exec-route-provider.cjs'; let s=fs.readFileSync(f,'utf8');
if(!s.includes('function __toPk(')){
  s = s.replace(/(^|\n)/, `$1function __toPk(x){ const {PublicKey}=require('@solana/web3.js'); const v=(x==null?'':String(x)).trim(); if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)){ throw new Error('Bad pubkey: '+JSON.stringify(x)); } return new PublicKey(v); }\n`);
}
s = s.replace(/new\s+PublicKey\s*\(/g,'__toPk(');
fs.writeFileSync(f,s); console.log('hardened PublicKey(); added debug');
