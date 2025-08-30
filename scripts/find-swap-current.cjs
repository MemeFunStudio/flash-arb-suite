const {PublicKey}=require('@solana/web3.js');
const RPC=(process.env.RPC||'').trim();
const RAY_PROG=(process.env.RAY_PROG||'').trim();
const RAY_POOL=(process.env.RAY_POOL||'').trim();
const LIMIT=parseInt(process.env.LIMIT||'250',10);
const PAGES=parseInt(process.env.PAGES||'3',10);
if(!/^https?:\/\//.test(RPC)||!RAY_PROG||!RAY_POOL){console.log('NONE');process.exit(0)}
const prog=new PublicKey(RAY_PROG), pool=new PublicKey(RAY_POOL);
const ORACLE=PublicKey.findProgramAddressSync([Buffer.from('oracle'),pool.toBuffer()],prog)[0].toBase58();
const OBS   =PublicKey.findProgramAddressSync([Buffer.from('observation'),pool.toBuffer()],prog)[0].toBase58();
async function post(method,params){
  const r=await fetch(RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
  const j=await r.json(); if(j.error) throw new Error(JSON.stringify(j.error)); return j.result||[];
}
async function decodeTx(sig){
  const r=await post('getTransaction',[sig,{maxSupportedTransactionVersion:0}]);
  if(!r||r.meta&&r.meta.err) return null;
  const msg=r.transaction.message;
  const acc=(msg.accountKeys||[]).map(k=>(k.pubkey||k).toString());
  const la=r.meta&&r.meta.loadedAddresses?{w:r.meta.loadedAddresses.writable||[],ro:r.meta.loadedAddresses.readonly||[]}:{w:[],ro:[]};
  const set=new Set([...acc,...la.w,...la.ro]);
  return set;
}
async function scan(addr){
  let before=null;
  for(let p=0;p<PAGES;p++){
    const params=before?[addr,{limit:LIMIT,before}]:[addr,{limit:LIMIT}];
    const sigs=await post('getSignaturesForAddress',params);
    if(!sigs.length) break;
    for(const s of sigs){
      const set=await decodeTx(s.signature); if(!set) continue;
      if(set.has(ORACLE)&&set.has(OBS)){ console.log(s.signature); return true; }
    }
    before=sigs[sigs.length-1].signature;
  }
  return false;
}
(async()=>{
  if(await scan(RAY_POOL)) return;
  if(await scan(RAY_PROG)) return;
  console.log('NONE');
})().catch(()=>console.log('NONE'));
