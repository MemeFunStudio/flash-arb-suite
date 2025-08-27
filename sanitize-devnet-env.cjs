#!/usr/bin/env node
const fs=require('fs'), os=require('os');
const env=process.env.ENV || (os.homedir()+'/.flash-arb/devnet.env');
const raw=fs.readFileSync(env,'utf8').split(/\r?\n/);
const b58=/^[1-9A-HJ-NP-Za-km-z]+$/;
const out=raw.map(l=>{
  const m=/^export\s+([A-Z0-9_]+)=(.*)$/.exec(l);
  if(!m) return l;
  const k=m[1]; let v=m[2].replace(/^['"]|['"]$/g,'');
  if(/^EXTRA_\d+$/.test(k)) { v=v.replace(/[^1-9A-HJ-NP-Za-km-z]/g,'').slice(0,44); return `${k}=${v}`; }
  return `export ${k}='${v}'`;
});
fs.writeFileSync(env,out.join('\n'));
console.log('sanitized extras only:',env);
