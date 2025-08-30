const {PublicKey}=require('@solana/web3.js');

const RPC=(process.env.RPC||'https://solana-devnet.api.onfinality.io/public').trim();
const RAY_PROG=new PublicKey((process.env.RAY_PROG||'').trim());
const LIMIT=Math.min(parseInt(process.env.LIMIT||'80',10),200);
const TIME_LIMIT=Math.min(parseInt(process.env.TIME_LIMIT||'20000',10),60000);
const DEADLINE=Date.now()+TIME_LIMIT;

async function post(method,params){
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),Math.max(1,DEADLINE-Date.now()));
  try{
    const r=await fetch(RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:ctrl.signal});
    const j=await r.json(); if(j.error) return null; return j.result;
  }catch(_){return null} finally{clearTimeout(t)}
}

function keysFromTx(res){
  if(!res||!res.transaction) return null;
  const msg=res.transaction.message;
  const set=new Set();
  if(Array.isArray(msg.accountKeys)){
    for(const k of msg.accountKeys){
      const v=typeof k==='string'?k:(k&&k.pubkey)||null;
      if(v) set.add(v.toString());
    }
  }
  const la=res.meta&&res.meta.loadedAddresses?res.meta.loadedAddresses:null;
  if(la){
    for(const k of la.writable||[]) set.add(k.toString());
    for(const k of la.readonly||[]) set.add(k.toString());
  }
  return set;
}

function hasOracleObs(poolPk,progPk,set){
  const o=PublicKey.findProgramAddressSync([Buffer.from('oracle'),poolPk.toBuffer()],progPk)[0].toBase58();
  const ob=PublicKey.findProgramAddressSync([Buffer.from('observation'),poolPk.toBuffer()],progPk)[0].toBase58();
  return set.has(o)&&set.has(ob);
}

(async()=>{
  const sigs=await post('getSignaturesForAddress',[RAY_PROG.toBase58(),{limit:LIMIT}]);
  if(!Array.isArray(sigs)||!sigs.length){ console.log('NONE'); process.exit(2); }
  for(const s of sigs){
    if(Date.now()>DEADLINE){ console.log('NONE'); process.exit(3); }
    const tx=await post('getTransaction',[s.signature,{maxSupportedTransactionVersion:0}]);
    if(!tx||tx.meta&&tx.meta.err) continue;
    const set=keysFromTx(tx); if(!set) continue;
    for(const k of set){
      let pk; try{ pk=new PublicKey(k); }catch{ continue; }
      if(hasOracleObs(pk,RAY_PROG,set)){
        console.log('POOL='+pk.toBase58());
        console.log('TX='+s.signature);
        process.exit(0);
      }
    }
  }
  console.log('NONE'); process.exit(4);
})().catch(()=>{ console.log('NONE'); process.exit(1); });
