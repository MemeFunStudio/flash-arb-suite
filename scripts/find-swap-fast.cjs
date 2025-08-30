const {PublicKey}=require('@solana/web3.js');
const RPC=((process.env.RPC_HISTORY||process.env.RPC)||'').trim();
const RAY_PROG=(process.env.RAY_PROG||'').trim();
const RAY_POOL=(process.env.RAY_POOL||'').trim();
const LIMIT=Math.min(parseInt(process.env.LIMIT||'120',10),300);
const PAGES=Math.min(parseInt(process.env.PAGES||'2',10),5);
if(!/^https?:\/\//.test(RPC)||!RAY_PROG){console.log('NONE');process.exit(0);}
const prog=new PublicKey(RAY_PROG);
async function post(method,params,ms=10000){
  const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),ms);
  try{
    const r=await fetch(RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:ctrl.signal});
    const j=await r.json(); if(j.error) throw new Error(JSON.stringify(j.error)); return j.result;
  }catch(_){return null} finally{clearTimeout(t)}
}
function findPoolInSet(set){
  for(const k of set){
    try{
      const pool=new PublicKey(k);
      const oracle=PublicKey.findProgramAddressSync([Buffer.from('oracle'),pool.toBuffer()],prog)[0].toBase58();
      const obs   =PublicKey.findProgramAddressSync([Buffer.from('observation'),pool.toBuffer()],prog)[0].toBase58();
      if(set.has(oracle)&&set.has(obs)) return pool.toBase58();
    }catch(_){}
  }
  return '';
}
async function decode(signature){
  const r=await post('getTransaction',[signature,{maxSupportedTransactionVersion:0}],12000);
  if(!r||r.meta&&r.meta.err) return null;
  const msg=r.transaction.message;
  const ak=(msg.accountKeys||[]).map(k=>(k.pubkey||k).toString());
  const la=r.meta&&r.meta.loadedAddresses?{w:r.meta.loadedAddresses.writable||[],ro:r.meta.loadedAddresses.readonly||[]}:{w:[],ro:[]};
  return new Set([...ak,...la.w,...la.ro]);
}
async function scan(addr){
  let before=null;
  for(let p=0;p<PAGES;p++){
    const sigs=await post('getSignaturesForAddress', before?[addr,{limit:LIMIT,before}]:[addr,{limit:LIMIT}],8000);
    if(!Array.isArray(sigs)||!sigs.length) break;
    for(const s of sigs){
      const set=await decode(s.signature); if(!set) continue;
      const pool=findPoolInSet(set); if(pool){console.log('SIG='+s.signature); console.log('POOL='+pool); return true;}
    }
    before=sigs[sigs.length-1].signature;
  }
  return false;
}
(async()=>{
  if(RAY_POOL && await scan(RAY_POOL)) return;
  if(await scan(RAY_PROG)) return;
  console.log('NONE');
})();
