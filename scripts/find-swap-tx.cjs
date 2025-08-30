const {Connection,PublicKey}=require("@solana/web3.js");
function need(k){const v=(process.env[k]||"").trim();if(!v)throw new Error("Missing "+k);return new PublicKey(v)}
const RPC=(process.env.RPC||"https://devnet.helius-rpc.com/?api-key=37658bc7-5bd1-47f4-ad34-56b7a125011d").trim();
const WS=RPC.replace(/^http/,"ws");
const RAY_PROG=need("RAY_PROG"), RAY_POOL=need("RAY_POOL");
const [ORACLE]=PublicKey.findProgramAddressSync([Buffer.from("oracle"),RAY_POOL.toBuffer()],RAY_PROG);
const [OBS]=PublicKey.findProgramAddressSync([Buffer.from("observation"),RAY_POOL.toBuffer()],RAY_PROG);
const cn=new Connection(RPC,{commitment:"confirmed",wsEndpoint:WS});
function decode(tx){const m=tx.transaction.message;
  if("accountKeys" in m){return{keys:m.accountKeys.map(k=>new PublicKey(k.toString())),instr:m.instructions.map(ix=>({programIdIndex:ix.programIdIndex,accounts:ix.accounts}))}}
  const ck=m.getAccountKeys({accountKeysFromLookups:tx.meta?.loadedAddresses});
  const keys=[...ck.staticAccountKeys,...(ck.accountKeysFromLookups?.writable||[]),...(ck.accountKeysFromLookups?.readonly||[])];
  const ci=m.compiledInstructions||m.instructions||[];
  const instr=ci.map(ix=>({programIdIndex:ix.programIdIndex,accounts:(ix.accountKeyIndexes||ix.accounts||[])}));
  return {keys,instr}
}
(async()=>{
  const LIMIT=Math.max(50,Math.min(parseInt(process.env.LIMIT||"300",10),800));
  const PAGES=Math.max(1,Math.min(parseInt(process.env.PAGES||"4",10),8));
  let before=null;
  for(let p=0;p<PAGES;p++){
    const sigs=await cn.getSignaturesForAddress(RAY_PROG,{limit:LIMIT,before});
    if(!sigs.length) break;
    for(const s of sigs){
      const tx=await cn.getTransaction(s.signature,{maxSupportedTransactionVersion:0});
      await new Promise(r=>setTimeout(r,150));
      if(!tx||tx.meta?.err) continue;
      const {keys,instr}=decode(tx);
      const rix=keys.findIndex(k=>k.equals(RAY_PROG)); if(rix<0) continue;
      for(const ix of instr){
        if(ix.programIdIndex!==rix) continue;
        const set=new Set(ix.accounts.map(i=>keys[i]?.toBase58()).filter(Boolean));
        if(set.has(RAY_POOL.toBase58())&&set.has(ORACLE.toBase58())&&set.has(OBS.toBase58())){
          console.log("FOUND",s.signature);
          console.log("EXPLORER https://explorer.solana.com/tx/"+s.signature+"?cluster=devnet");
          process.exit(0);
        }
      }
    }
    before=sigs[sigs.length-1].signature;
  }
  console.log("NONE");
  process.exit(2);
})().catch(e=>{console.error("ERR",e.message);process.exit(1)});
