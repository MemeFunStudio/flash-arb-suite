const {Connection,PublicKey}=require("@solana/web3.js");
const RPC=(process.env.RPC||"https://api.devnet.solana.com").trim();
const PROG=new PublicKey((process.env.PROG||"").trim());
if(!process.env.PROG) { console.log("NONE"); process.exit(0); }
async function pick(){
  const cn=new Connection(RPC,"confirmed");
  const sigs=await cn.getSignaturesForAddress(PROG,{limit:24}).catch(()=>[]);
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
    const pIndex=keys.findIndex(k=>k.equals(PROG));
    if(pIndex<0) continue;
    for(const ix of instr.filter(i=>i.p===pIndex)){
      for(const ai of ix.a){
        const k=keys[ai]; if(!k||k.equals(PROG)) continue;
        const b=k.toBase58(); seen.set(b,(seen.get(b)||0)+1);
      }
    }
    await new Promise(r=>setTimeout(r,150));
  }
  const best=[...seen.entries()].sort((a,b)=>b[1]-a[1])[0];
  return best?best[0]:"";
}
pick().then(m=>console.log(m||"NONE")).catch(()=>console.log("NONE"));
