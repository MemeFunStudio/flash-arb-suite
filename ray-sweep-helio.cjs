const fs=require("fs"),{Connection,PublicKey}=require("@solana/web3.js");
const RPC=process.env.RPC||"https://api.devnet.solana.com";
const RAY_PROG=new PublicKey(process.env.RAY_PROG.trim());
const RAY_POOL=new PublicKey(process.env.RAY_POOL.trim());
const ENV_PATH=`${process.env.HOME}/.flash-arb/devnet.env`;
const cn=new Connection(RPC,"confirmed");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function backoff(fn){let d=400;for(let i=0;i<12;i++){try{return await fn();}catch(e){if(i===11)throw e;await sleep(d+Math.random()*200);d=Math.min(d*1.8,8000);}}}
function existingExtras(){if(!fs.existsSync(ENV_PATH))return new Set();const t=fs.readFileSync(ENV_PATH,"utf8");const s=new Set();for(const l of t.split("\n")){const m=l.match(/^EXTRA_\d+=([1-9A-HJ-NP-Za-km-z]{32,44})$/);if(m)s.add(m[1]);}return s;}
(async()=>{
  const pool=await backoff(()=>cn.getAccountInfo(RAY_POOL,"confirmed")); if(!pool) throw new Error("RAY_POOL not found");
  const poolBytes=Buffer.from(RAY_POOL.toBytes());
  const cands=new Map();
  // scrape 32-byte pubkeys embedded in pool data
  for(let o=0;o+32<=pool.data.length;o++){ const pk=new PublicKey(pool.data.subarray(o,o+32)); cands.set(pk.toBase58(),pk); }
  // wider memcmp scan (keyed RPC): offsets 0..224 step 1, throttled
  for(let off=0; off<=224; off++){
    const res=await backoff(()=>cn.getProgramAccounts(RAY_PROG,{commitment:"confirmed",dataSlice:{offset:0,length:0},filters:[{memcmp:{offset:off,bytes:RAY_POOL.toBase58()}}]}));
    for(const {pubkey} of res) cands.set(pubkey.toBase58(),pubkey);
    await sleep(120); // gentle but fast on Helius
  }
  // verify: owner==RAY_PROG and data contains pool bytes
  const uniq=[...cands.values()], extras=[];
  for(let i=0;i<uniq.length;i+=25){
    const chunk=uniq.slice(i,i+25);
    const infos=await backoff(()=>cn.getMultipleAccountsInfo(chunk,"confirmed"));
    for(let j=0;j<chunk.length;j++){ const ai=infos[j]; if(!ai) continue;
      if(ai.owner.equals(RAY_PROG) && Buffer.from(ai.data).includes(poolBytes)) extras.push(chunk[j]);
    }
    await sleep(150);
  }
  const exist=existingExtras();
  const union=new Set([...exist, ...extras.map(p=>p.toBase58())]);
  const keep=[...union].slice(0,170); // keep TX <220 metas
  const base=(fs.existsSync(ENV_PATH)?fs.readFileSync(ENV_PATH,"utf8"):"").split("\n").filter(l=>!/^EXTRA_\d+=/.test(l)).join("\n").trimEnd();
  const lines=keep.map((s,i)=>`EXTRA_${i+1}=${s}`).join("\n");
  fs.writeFileSync(ENV_PATH,(base?base+"\n":"")+lines+"\n");
  console.log(`Pinned/merged ${keep.length} EXTRA_* accounts to ${ENV_PATH}`);
})(); 
