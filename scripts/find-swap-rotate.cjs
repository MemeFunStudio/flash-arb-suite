const fs=require('fs');
const {PublicKey}=require('@solana/web3.js');
const RAY_PROG=(process.env.RAY_PROG||'').trim();
const RAY_POOL=(process.env.RAY_POOL||'').trim();
const LIMIT=Math.min(parseInt(process.env.LIMIT||'100',10),300);
const PAGES=Math.min(parseInt(process.env.PAGES||'2',10),5);
if(!RAY_PROG){process.stdout.write('NONE\n');process.exit(0)}
function loadRPCs(){
  const list=[];
  if(process.env.RPC_HISTORY) list.push(process.env.RPC_HISTORY.trim());
  if(process.env.RPC) list.push(process.env.RPC.trim());
  try{ const p=process.env.HOME+'/.flash-arb/rpcs.devnet'; if(fs.existsSync(p)){ for(const l of fs.readFileSync(p,'utf8').split('\n')){ const s=l.trim(); if(s) list.push(s); } } }catch(_){}
  list.push('https://solana-devnet.api.onfinality.io/public');
  list.push('https://api.devnet.solana.com');
  const out=[]; const seen=new Set();
  for(const r of list){ if(/^https?:\/\//.test(r) && !seen.has(r)){ seen.add(r); out.push(r); } }
  return out;
}
async function post(rpc,method,params,ms){
  const c=new AbortController(); const t=setTimeout(()=>c.abort(),ms);
  try{
    const res=await fetch(rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:c.signal});
    const j=await res.json(); if(j.error) return null; return j.result;
  }catch(_){return null} finally{clearTimeout(t)}
}
function detectPoolInSet(set,prog){
  for(const k of set){
    try{
      const pool=new PublicKey(k);
      const oracle=PublicKey.findProgramAddressSync([Buffer.from('oracle'),pool.toBuffer()],prog)[0].toBase58();
      const obs=PublicKey.findProgramAddressSync([Buffer.from('observation'),pool.toBuffer()],prog)[0].toBase58();
      if(set.has(oracle) && set.has(obs)) return pool.toBase58();
    }catch(_){}
  }
  return '';
}
async function decode(rpc,sig,prog){
  const r=await post(rpc,'getTransaction',[sig,{maxSupportedTransactionVersion:0}],12000);
  if(!r||r.meta&&r.meta.err) return null;
  const msg=r.transaction.message;
  const ak=(msg.accountKeys||[]).map(k=>(k.pubkey||k).toString());
  const la=r.meta&&r.meta.loadedAddresses?{w:r.meta.loadedAddresses.writable||[],ro:r.meta.loadedAddresses.readonly||[]}:{w:[],ro:[]};
  return new Set([...ak,...la.w,...la.ro]);
}
async function scan(rpc,addr,prog){
  let before=null;
  for(let p=0;p<PAGES;p++){
    const sigs=await post(rpc,'getSignaturesForAddress', before?[addr,{limit:LIMIT,before}]:[addr,{limit:LIMIT}],8000);
    if(!Array.isArray(sigs)||!sigs.length) break;
    for(const s of sigs){
      const set=await decode(rpc,s.signature,prog); if(!set) continue;
      const pool=detectPoolInSet(set,prog);
      if(pool){ process.stdout.write('RPC='+rpc+'\n'); process.stdout.write('SIG='+s.signature+'\n'); process.stdout.write('POOL='+pool+'\n'); return true; }
    }
    before=sigs[sigs.length-1].signature;
  }
  return false;
}
(async()=>{
  const prog=new PublicKey(RAY_PROG);
  const addrs=[];
  if(RAY_POOL) addrs.push(RAY_POOL);
  addrs.push(RAY_PROG);
  const rpcs=loadRPCs();
  for(const rpc of rpcs){
    for(const a of addrs){ const ok=await scan(rpc,a,prog); if(ok) return; }
  }
  process.stdout.write('NONE\n');
})();
