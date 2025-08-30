const {Connection,PublicKey}=require("@solana/web3.js");
const primary=(process.env.RPC||"https://api.devnet.solana.com").trim();
const fallback="https://api.devnet.solana.com";
const PHX=new PublicKey((process.env.PHX_PROG||"PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY").trim());
async function pick(rpc){
  const cn=new Connection(rpc,"confirmed");
  const sigs=await cn.getSignaturesForAddress(PHX,{limit:20});
  const seen=new Map();
  for(const s of sigs){
    const tx=await cn.getTransaction(s.signature,{maxSupportedTransactionVersion:0}).catch(()=>null);
    if(!tx||tx.meta?.err) continue;
    const msg=tx.transaction.message;
    let keys=[], instr=[];
    if("accountKeys" in msg){
      keys=msg.accountKeys.map(k=>new PublicKey(k.toString()));
      instr=msg.instructions.map(ix=>({p:ix.programIdIndex,a:ix.accounts}));
    }else{
      const ck=msg.getAccountKeys({accountKeysFromLookups: tx.meta?.loadedAddresses});
      keys=[...ck.staticAccountKeys,...(ck.accountKeysFromLookups?.writable||[]),...(ck.accountKeysFromLookups?.readonly||[])];
      const ci=msg.compiledInstructions||msg.instructions||[];
      instr=ci.map(ix=>({p:ix.programIdIndex,a:(ix.accountKeyIndexes||ix.accounts||[])}));
    }
    const pIndex = keys.findIndex(k=>k.equals(PHX));
    if(pIndex<0) continue;
    for(const ix of instr.filter(i=>i.p===pIndex)){
      for(const ai of ix.a){
        const k=keys[ai]; if(!k||k.equals(PHX)) continue;
        seen.set(k.toBase58(), (seen.get(k.toBase58())||0)+1);
      }
    }
    await new Promise(r=>setTimeout(r,200));
  }
  const best=[...seen.entries()].sort((a,b)=>b[1]-a[1])[0];
  return best?best[0]:"";
}
(async()=>{
  let m="";
  try{ m=await pick(primary); }catch{ m=""; }
  if(!m){
    await new Promise(r=>setTimeout(r,600));
    try{ m=await pick(fallback); }catch{ m=""; }
  }
  console.log(m||"NONE");
})().catch(()=>{console.log("NONE")});
