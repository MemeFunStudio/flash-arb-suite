const fs=require('fs'), os=require('os'), path=require('path');
const envPath=process.env.ENV||path.join(os.homedir(),'.flash-arb','devnet.env');
const bkp=envPath+'.bak.'+Date.now();
const raw=fs.readFileSync(envPath,'utf8'); fs.writeFileSync(bkp,raw);
const is58=c=>/[1-9A-HJ-NP-Za-km-z]/.test(c);
const trim58=s=>{ s=String(s).trim().replace(/^['"]|['"]$/g,''); let o=''; for(const ch of s){ if(is58(ch)) o+=ch; else break; } return o; };
const out=raw.split(/\r?\n/).map(l=>{
  let m=/^\s*export\s+([A-Z0-9_]+)\s*=\s*(.+)$/.exec(l);
  if(m){ const k=m[1], v=trim58(m[2]); return v?`export ${k}='${v}'`:l; }
  m=/^EXTRA_(\d+)=(.+)$/.exec(l);
  if(m){ const i=m[1], v=trim58(m[2]); return `EXTRA_${i}=${v}`; }
  return l;
});
fs.writeFileSync(envPath,out.join('\n'));
console.log('sanitized',envPath,'backup',bkp);
