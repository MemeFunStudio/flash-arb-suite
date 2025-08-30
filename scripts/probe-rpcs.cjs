const fs=require('fs');
const listPath=process.env.LIST||(process.env.HOME+'/.flash-arb/rpcs.devnet');
const addr=(process.env.RAY_PROG||'').trim();
const testAddr=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)?addr:null;
const endpoints=fs.readFileSync(listPath,'utf8').split('\n').map(s=>s.trim()).filter(Boolean);
async function call(url,method,params,ms){
  const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),ms);
  try{const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:ctrl.signal}); const j=await r.json(); return {status:r.status,body:j};}
  catch(e){return {status:0,body:{error:{message:String(e&&e.message||e)}}};}
  finally{clearTimeout(t)}
}
(async()=>{
  for(const url of endpoints){
    const a1=await call(url,'getVersion',[],4000);
    const a2=await call(url,'getLatestBlockhash',[{commitment:'confirmed'}],4000);
    let hist={status:0,body:{}}; if(testAddr) hist=await call(url,'getSignaturesForAddress',[testAddr,{limit:5}],5000);
    const out={url,ok:!!(a1.body&&a1.body.result&&a2.body&&a2.body.result),version:a1.body&&a1.body.result?(a1.body.result['solana-core']||''):'',blockhash_ok:!!(a2.body&&a2.body.result),hist_ok:!!(hist.body&&Array.isArray(hist.body.result)),s1:a1.status,s2:a2.status,s3:hist.status,e1:a1.body&&a1.body.error?a1.body.error.message:'',e2:a2.body&&a2.body.error?a2.body.error.message:'',e3:hist.body&&hist.body.error?hist.body.error.message:''};
    console.log(JSON.stringify(out));
  }
})();
