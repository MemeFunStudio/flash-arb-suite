const {PublicKey}=require('@solana/web3.js');
const RPC=(process.env.RPC||'').trim();
const PROG=(process.env.RAY_PROG||'').trim();
const TX=(process.env.TX||'').trim();
if(!RPC||!PROG||!TX){console.log('');process.exit(0);}
async function post(method,params){
  const r=await fetch(RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
  return await r.json();
}
(async()=>{
  const tr=await post('getTransaction',[TX,{maxSupportedTransactionVersion:0}]);
  const t=tr.result; if(!t){console.log('');return;}
  const msg=t.transaction.message;
  const ak=(msg.accountKeys||[]).map(k=>(k.pubkey||k).toString());
  const la=t.meta&&t.meta.loadedAddresses?{w:t.meta.loadedAddresses.writable||[],ro:t.meta.loadedAddresses.readonly||[]}:{w:[],ro:[]};
  const keys=[...ak,...la.w,...la.ro];
  const set=new Set(keys);
  const prog=new PublicKey(PROG);
  for(const k of keys){
    try{
      const pool=new PublicKey(k);
      const oracle=PublicKey.findProgramAddressSync([Buffer.from('oracle'),pool.toBuffer()],prog)[0].toBase58();
      const obs=PublicKey.findProgramAddressSync([Buffer.from('observation'),pool.toBuffer()],prog)[0].toBase58();
      if(set.has(oracle)&&set.has(obs)){ console.log(pool.toBase58()); return; }
    }catch(_){}
  }
  console.log('');
})();
