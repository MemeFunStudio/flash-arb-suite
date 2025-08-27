const fs=require("fs"), crypto=require("crypto");
const {Connection,PublicKey,Keypair,Transaction,TransactionInstruction,SystemProgram}=require("@solana/web3.js");
const RPC=process.env.RPC||"https://api.devnet.solana.com";
const need=k=>new PublicKey((process.env[k]||"").trim());
const opt =k=>process.env[k]?new PublicKey(process.env[k].trim()):null;

const PROGRAM=need("PROGRAM"), GLOBAL=need("GLOBAL"), POOL=need("POOL");
const VAPDA=need("VAPDA"), VATA=need("VATA"), USDC=need("USDC_MINT");
const RAY_PROG=need("RAY_PROG"), RAY_POOL=need("RAY_POOL");
const TOKEN_PROG=new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

const [ORACLE]=PublicKey.findProgramAddressSync([Buffer.from("oracle"),RAY_POOL.toBuffer()],RAY_PROG);
const [OBS]=PublicKey.findProgramAddressSync([Buffer.from("observation"),RAY_POOL.toBuffer()],RAY_PROG);
const [BITMAP]=PublicKey.findProgramAddressSync([Buffer.from("pool_tick_array_bitmap_extension"),RAY_POOL.toBuffer()],RAY_PROG);

const VAULT_A=opt("VAULT_A"), VAULT_B=opt("VAULT_B"), MINT_B=opt("MINT_B");
const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync("./phantom-owner.json","utf8"))));
const cn=new Connection(RPC,"confirmed");
const backoff=async(fn)=>{let d=250;for(let i=0;i<6;i++){try{return await fn();}catch(e){if(i===5)throw e;await new Promise(r=>setTimeout(r,d));d=Math.min(d*2,1200);}}};

// --- read IDL to get exact account order + signer/writable flags
const idl=JSON.parse(fs.readFileSync(`idl/${PROGRAM.toBase58()}.json`,"utf8"));
const ixDef=idl.instructions.find(i=>["execute_route","executeRoute","execute"].includes(i.name));
if(!ixDef) throw new Error("execute_route not found in IDL");
const flatten=(a,o=[])=>{for(const x of a){o.push(x); if(x.accounts) flatten(x.accounts,o);} return o;};
const defs=flatten(ixDef.accounts);
const isCaller=(n)=>["caller","authority","owner","user","signer","executor"].includes(n.toLowerCase());
const forceW=(n)=>/vault/.test(n.toLowerCase())||["global","pool"].includes(n.toLowerCase());
const mapName=(n)=>{
  const k=n.replace(/[^a-z]/gi,"").toLowerCase();
  if(["global","globalstate","globalconfig"].includes(k)) return GLOBAL;
  if(["pool","poolstate","poolconfig"].includes(k)) return POOL;
  if(isCaller(k)) return payer.publicKey;
  if(["vault","vaultata","vata","vaultstate"].includes(k)) return VATA;
  if(["vaultauthority","vaultauth","vapda"].includes(k)) return VAPDA;
  if(["mint","usdc","quotemint"].includes(k)) return USDC;
  if(["tokenprogram"].includes(k)) return TOKEN_PROG;
  if(["systemprogram"].includes(k)) return SystemProgram.programId;
  throw new Error("No mapping for "+n);
};
const base=defs.map(a=>({pubkey:mapName(a.name),isSigner:a.isSigner||isCaller(a.name),isWritable:a.isMut||forceW(a.name)}));

// --- light discovery: scan RAY_POOL data for embedded pubkeys and keep ones owned by RAY_PROG
(async()=>{
  const ai=await backoff(()=>cn.getAccountInfo(RAY_POOL,"confirmed"));
  if(!ai) throw new Error("RAY_POOL not found");
  const bytes=ai.data;
  const cands=[];
  for(let o=0;o+32<=bytes.length;o+=1){ // tight scan but single account
    const pk=new PublicKey(bytes.subarray(o,o+32));
    cands.push(pk);
  }
  // batch lookups
  const uniqMap=new Map(); for(const p of cands){uniqMap.set(p.toBase58(),p);}
  const uniq=[...uniqMap.values()];
  const EXTRA=[];
  for(let i=0;i<uniq.length;i+=40){
    const chunk=uniq.slice(i,i+40);
    const infos=await backoff(()=>cn.getMultipleAccountsInfo(chunk,"confirmed"));
    for(let j=0;j<chunk.length;j++){
      const info=infos[j];
      if(!info) continue;
      const owner=info.owner.toBase58();
      if(owner===RAY_PROG.toBase58()){
        EXTRA.push({pubkey:chunk[j],isSigner:false,isWritable:false});
      }
    }
    if(EXTRA.length>=200) break; // cap
  }

  // fixed known accounts
  const remFixed=[RAY_PROG,RAY_POOL,ORACLE,OBS,VAULT_A,VAULT_B,MINT_B,BITMAP]
    .filter(Boolean).map(x=>({pubkey:x,isSigner:false,isWritable:false}));

  const keys=[...base,...remFixed,...EXTRA];
  const disc=crypto.createHash("sha256").update("global:"+ixDef.name).digest().slice(0,8);
  const data=Buffer.concat([disc,Buffer.alloc(8,0),Buffer.alloc(4,0)]); // principal=0, route_len=0

  const ix=new TransactionInstruction({programId:PROGRAM,keys,data});
  const tx=new Transaction().add(ix);
  tx.feePayer=payer.publicKey;
  const {blockhash}=await cn.getLatestBlockhash("confirmed");
  tx.recentBlockhash=blockhash;
  tx.sign(payer);

  const sig=await cn.sendRawTransaction(tx.serialize(),{skipPreflight:true});
  console.log("Included EXTRA (owned by Raydium CLMM):");
  console.log(EXTRA.map(x=>x.pubkey.toBase58()).join("\n")||"(none)");
  console.log("DRY-RUN SENT:",sig);
  console.log("Explorer: https://explorer.solana.com/tx/"+sig+"?cluster=devnet");
})().catch(e=>{
  console.error("error:",e.message); if(e.transactionLogs) console.error(e.transactionLogs.join("\n"));
});
