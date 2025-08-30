const {PublicKey}=require('@solana/web3.js');

const RPC=(process.env.RPC||'https://solana-devnet.api.onfinality.io/public').trim();
const RAY_PROG=new PublicKey((process.env.RAY_PROG||'').trim());
const RAY_POOL=new PublicKey((process.env.RAY_POOL||'').trim());
const LIMIT=Math.min(parseInt(process.env.LIMIT||'80',10),200);
const TIME_LIMIT=Math.min(parseInt(process.env.TIME_LIMIT||'12000',10),30000);
const DEADLINE=Date.now()+TIME_LIMIT;

async function post(method,params){
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),Math.max(1,DEADLINE-Date.now()));
  try{
    const r=await fetch(RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:ctrl.signal});
    const j=await r.json(); if(j.error) return null; return j.result;
  }catch(_){return null} finally{clearTimeout(t)}
}

function keysFromTx(tx){
  const set=new Set();
  const msg=tx.transaction.message;
  if(Array.isArray(msg.accountKeys)){
    for(const k of msg.accountKeys){ const s=(k.pubkey||k).toString(); if(s) set.add(s); }
  }
  const la=tx.meta&&tx.meta.loadedAddresses?tx.meta.loadedAddresses:null;
  if(la){
    for(const k of (la.writable||[])) set.add(k.toString());
    for(const k of (la.readonly||[])) set.add(k.toString());
  }
  return set;
}

function wantSet(pool,prog){
  const o=PublicKey.findProgramAddressSync([Buffer.from('oracle'),pool.toBuffer()],prog)[0].toBase58();
  const ob=PublicKey.findProgramAddressSync([Buffer.from('observation'),pool.toBuffer()],prog)[0].toBase58();
  return {o,ob};
}

(async()=>{
  const sigs=await post('getSignaturesForAddress',[RAY_POOL.toBase58(),{limit:LIMIT}]);
  if(!Array.isArray(sigs)||!sigs.length){ process.exit(2); }
  const want=wantSet(RAY_POOL,RAY_PROG);
  for(const s of sigs){
    if(Date.now()>DEADLINE){ process.exit(3); }
    const tx=await post('getTransaction',[s.signature,{maxSupportedTransactionVersion:0}]);
    if(!tx||tx.meta&&tx.meta.err) continue;
    const set=keysFromTx(tx);
    if(set.has(want.o)&&set.has(want.ob)){
      console.log('POOL='+RAY_POOL.toBase58());
      console.log('TX='+s.signature);
      process.exit(0);
    }
  }
  process.exit(4);
})().catch(()=>process.exit(1));
