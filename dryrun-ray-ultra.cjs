const fs=require("fs"), {Connection,PublicKey}=require("@solana/web3.js");
const RPC=process.env.RPC||"https://api.devnet.solana.com";
const RAY_PROG=new PublicKey(process.env.RAY_PROG.trim());
const RAY_POOL=new PublicKey(process.env.RAY_POOL.trim());
const ENV_PATH=`${process.env.HOME}/.flash-arb/devnet.env`;
const cn=new Connection(RPC,"confirmed");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function backoff(fn){let d=500;for(let i=0;i<12;i++){try{return await fn();}catch(e){if(i===11)throw e;await sleep(d);d=Math.min(d*2,8000);}}}
(async()=>{
  const poolBytes=Buffer.from(RAY_POOL.toBytes());
  // 1) scrape 32-byte keys from pool account
  const ai=await backoff(()=>cn.getAccountInfo(RAY_POOL,"confirmed"));
  if(!ai) throw new Error("RAY_POOL not found");
  const seed=new Map();
  for(let o=0;o+32<=ai.data.length;o++){
    const pk=new PublicKey(ai.data.subarray(o,o+32)); seed.set(pk.toBase58(),pk);
  }
  // 2) throttled memcmp hunt across many offsets (step 4 to reduce calls)
  const offsets=[]; for(let i=0;i<=160;i+=4) offsets.push(i);
  for(const off of offsets){
    const res=await backoff(()=>cn.getProgramAccounts(RAY_PROG,{
      commitment:"confirmed", dataSlice:{offset:0,length:0},
      filters:[{memcmp:{offset:off,bytes:RAY_POOL.toBase58()}}]
    }));
    for(const {pubkey} of res){ seed.set(pubkey.toBase58(),pubkey); }
    await sleep(900);
  }
  // 3) verify ownership+payload actually references the pool
  const uniq=[...seed.values()], extras=[];
  for(let i=0;i<uniq.length;i+=12){
    const chunk=uniq.slice(i,i+12);
    const infos=await backoff(()=>cn.getMultipleAccountsInfo(chunk,"confirmed"));
    for(let j=0;j<chunk.length;j++){
      const ai=infos[j]; if(!ai) continue;
      if(ai.owner.equals(RAY_PROG) && Buffer.from(ai.data).includes(poolBytes)){
        extras.push(chunk[j]);
      }
    }
    await sleep(600);
  }
  // cap to 170 to keep tx < 220 metas
  const keep=extras.slice(0,170);
  const pre=(fs.existsSync(ENV_PATH)?fs.readFileSync(ENV_PATH,"utf8"):"")
    .split("\n").filter(l=>!/^EXTRA_\d+=/.test(l)).join("\n").trimEnd();
  const lines=keep.map((pk,i)=>`EXTRA_${i+1}=${pk.toBase58()}`).join("\n");
  fs.writeFileSync(ENV_PATH,(pre?pre+"\n":"")+lines+"\n");
  console.log(`Pinned ${keep.length} EXTRA_* accounts to ${ENV_PATH}`);
})().catch(e=>{console.error("ULTRA SWEEP ERROR:",e.message); process.exit(1);});
