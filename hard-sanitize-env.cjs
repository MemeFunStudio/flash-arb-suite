const fs=require('fs'), os=require('os'), path=require('path');
const envPath=process.env.ENV||path.join(os.homedir(),'.flash-arb','devnet.env');
const bkp=envPath+'.bak.'+Date.now();
const raw=fs.readFileSync(envPath,'utf8'); fs.writeFileSync(bkp,raw);
const alpha=/[1-9A-HJ-NP-Za-km-z]/;
const keep58=s=>{ s=String(s).trim().replace(/^['"]|['"]$/g,''); let o=''; for(const ch of s){ if(alpha.test(ch)) o+=ch; else break; } return o; };
const PKKEYS=new Set([
  'PROGRAM','GLOBAL','POOL','MINT','VAULT','VAULT_AUTHORITY',
  'CALLER','OWNER','AUTHORITY','TOKEN_PROGRAM','ASSOCIATED_TOKEN_PROGRAM',
  'SYSTEM_PROGRAM','SYSVAR_RENT',
  'MANGO_PROG','MANGO_GROUP','MANGO_USDC_BANK','MANGO_ACCOUNT','MANGO_CACHE','MANGO_TOKEN_VAULT',
  'PORT_PROG','PORT_LENDING_MARKET','PORT_USDC_RESERVE','PORT_USDC_LIQ_SUPPLY'
]);
const fix=(k,v)=>{
  v=keep58(v);
  if(PKKEYS.has(k) || /^EXTRA_\d+$/.test(k)) v=v.slice(0,44);
  return v;
};
const out=[];
for(const line of raw.split(/\r?\n/)){
  let m=/^\s*export\s+([A-Z0-9_]+)\s*=\s*(.+)$/.exec(line);
  if(m){ const k=m[1], v=fix(k,m[2]); out.push(`export ${k}='${v}'`); continue; }
  m=/^\s*(EXTRA_\d+)\s*=\s*(.+)$/.exec(line);
  if(m){ const k=m[1], v=fix(k,m[2]); out.push(`${k}=${v}`); continue; }
  out.push(line);
}
fs.writeFileSync(envPath,out.join('\n'));
console.log('hardened',envPath,'backup',bkp);
