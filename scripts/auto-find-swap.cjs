const fs=require('fs');
const {Connection,PublicKey}=require('@solana/web3.js');
function need(k){const v=(process.env[k]||'').trim(); if(!v) throw new Error('Missing '+k); return v;}
function opt(k){return (process.env[k]||'').trim()||'';}

async function probeOne(rpc, prog, limit, pages){
  const cn=new Connection(rpc,'confirmed');
  try{
    let before=undefined;
    for(let p=0;p<pages;p++){
      const sigs=await cn.getSignaturesForAddress(new PublicKey(prog),{limit, before});
      if(!sigs?.length) break;
      for(const s of sigs){
        const tx=await cn.getTransaction(s.signature,{maxSupportedTransactionVersion:0});
        if(!tx || tx.meta?.err) continue;
        const msg=tx.transaction.message;
        let keys=[], instr=[];
        if("accountKeys" in msg){
          keys = msg.accountKeys.map(k=>new PublicKey(k.toString()));
          instr= msg.instructions.map(ix=>({programIdIndex:ix.programIdIndex, accounts:ix.accounts}));
        }else{
          const ck=msg.getAccountKeys({accountKeysFromLookups: tx.meta?.loadedAddresses});
          keys=[...ck.staticAccountKeys, ...(ck.accountKeysFromLookups?.writable||[]), ...(ck.accountKeysFromLookups?.readonly||[])];
          const ci=msg.compiledInstructions||msg.instructions||[];
          instr=ci.map(ix=>({programIdIndex:ix.programIdIndex, accounts:(ix.accountKeyIndexes||ix.accounts||[])}));
        }
        const pidIndex = keys.findIndex(k=>k.equals(new PublicKey(prog)));
        if(pidIndex<0) continue;
        for(const ix of instr){
          if(ix.programIdIndex!==pidIndex) continue;
          const set=new Set(ix.accounts.map(i=>keys[i]?.toBase58()).filter(Boolean));
          let pool='';
          for(const k of set){ if(k && k!==prog){ pool=k; break; } }
          if(pool){
            return {sig:s.signature, pool, rpc};
          }
        }
      }
      before=sigs.at(-1)?.signature;
      await new Promise(r=>setTimeout(r,400));
    }
  }catch(e){}
  return null;
}

(async()=>{
  const RPCS=fs.readFileSync(process.env.RPCS_FILE|| (process.env.HOME+'/.flash-arb/rpcs.devnet'))+'';
  const list=RPCS.split(/\s+/).filter(Boolean);
  const RAY_PROG=opt('RAY_PROG');
  const ORCA_PROG=opt('ORCA_PROG');
  const LIMIT=parseInt(process.env.LIMIT||'60',10);
  const PAGES=parseInt(process.env.PAGES||'2',10);
  const order=[['RAY',RAY_PROG],['ORCA',ORCA_PROG]].filter(([,p])=>p);

  for(const [dex,prog] of order){
    for(const rpc of list){
      const found=await probeOne(rpc, prog, LIMIT, PAGES);
      if(found){
        console.log(JSON.stringify({dex,prog,tx:found.sig,pool:found.pool,rpc:found.rpc}));
        return;
      }
      await new Promise(r=>setTimeout(r,500));
    }
  }
  console.log('NONE');
})();
