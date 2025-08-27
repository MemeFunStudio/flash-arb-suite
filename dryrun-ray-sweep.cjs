const fs=require("fs"), {Connection,PublicKey}=require("@solana/web3.js");
const RPC=process.env.RPC||"https://api.devnet.solana.com";
const RAY_PROG=new PublicKey(process.env.RAY_PROG.trim());
const RAY_POOL=new PublicKey(process.env.RAY_POOL.trim());
const HOME=process.env.HOME, ENV_PATH=`${HOME}/.flash-arb/devnet.env`;
const cn=new Connection(RPC,"confirmed");
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function backoff(fn){let d=300;for(let i=0;i<12;i++){try{return await fn();}catch(e){if(i===11)throw e;await sleep(d+Math.random()*200);d=Math.min(d*2,6000);}}}

(async()=>{
  const pool=await backoff(()=>cn.getAccountInfo(RAY_POOL,"confirmed"));
  if(!pool) throw new Error("RAY_POOL not found");
  const poolBytes=Buffer.from(RAY_POOL.toBytes());
  const cands=new Map();
  // 1) scrape 32-byte pubkeys embedded in the pool account itself (cheap)
  for(let o=0;o+32<=pool.data.length;o++){
    const pk=new PublicKey(pool.data.subarray(o,o+32)); cands.set(pk.toBase58(),pk);
  }
  // verify in small chunks (gentle to RPC)
  const verified=[]; const list=[...cands.values()];
  for(let i=0;i<list.length;i+=20){
    const chunk=list.slice(i,i+20);
    const infos=await backoff(()=>cn.getMultipleAccountsInfo(chunk,"confirmed"));
    for(let j=0;j<chunk.length;j++){
      const ai=infos[j]; if(!ai) continue;
      if(ai.owner.equals(RAY_PROG) && Buffer.from(ai.data).includes(poolBytes)){
        verified.push(chunk[j]);
      }
    }
    await sleep(200);
  }
  // 2) light memcmp hunt on a wider set of offsets, but throttled
  const offsets=[0,8,16,24,32,40,64,72,80,88,96,104,112,120,128,136,144];
  const seen=new Map(verified.map(p=>[p.toBase58(),p]));
  for(const off of offsets){
    const res=await backoff(()=>cn.getProgramAccounts(RAY_PROG,{
      commitment:"confirmed",
      dataSlice:{offset:0,length:0},
      filters:[{memcmp:{offset:off,bytes:RAY_POOL.toBase58()}}]
    }));
    for(const {pubkey} of res){ if(!seen.has(pubkey.toBase58())) seen.set(pubkey.toBase58(),pubkey); }
    await sleep(250);
  }
  // re-verify memcmp finds (only keep those whose data really references the pool)
  const uniq=[...seen.values()];
  const extras=[];
  for(let i=0;i<uniq.length;i+=18){
    const chunk=uniq.slice(i,i+18);
    const infos=await backoff(()=>cn.getMultipleAccountsInfo(chunk,"confirmed"));
    for(let j=0;j<chunk.length;j++){
      const ai=infos[j]; if(!ai) continue;
      if(ai.owner.equals(RAY_PROG) && Buffer.from(ai.data).includes(poolBytes)){
        extras.push(chunk[j]);
      }
    }
    await sleep(250);
  }
  // cap to fit TX metas: keep up to 170 extras (base+fixed ~50 => <220 total)
  const keepExtras=extras.slice(0,170);
  // write EXTRA_* to env (remove old ones first)
  const pre=(fs.existsSync(ENV_PATH)?fs.readFileSync(ENV_PATH,"utf8"):"")
    .split("\n").filter(l=>!/^EXTRA_\d+=/.test(l)).join("\n").trimEnd();
  const lines=keepExtras.map((pk,i)=>`EXTRA_${i+1}=${pk.toBase58()}`).join("\n");
  fs.writeFileSync(ENV_PATH,(pre?pre+"\n":"")+lines+"\n");
  console.log(`Pinned ${keepExtras.length} EXTRA_* accounts to ${ENV_PATH}`);
})().catch(e=>{console.error("SWEEP ERROR:",e.message); process.exit(1);});
