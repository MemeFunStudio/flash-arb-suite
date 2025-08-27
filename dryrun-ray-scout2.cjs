const fs=require("fs"), crypto=require("crypto");
const {Connection,PublicKey,Keypair,Transaction,TransactionInstruction,SystemProgram}=require("@solana/web3.js");

const need=k=>new PublicKey((process.env[k]||"").trim());
const opt =k=>process.env[k]?new PublicKey(process.env[k].trim()):null;
const RPC=process.env.RPC||"https://api.devnet.solana.com";
const PROGRAM=need("PROGRAM"), GLOBAL=need("GLOBAL"), POOL=need("POOL");
const VAPDA=need("VAPDA"), VATA=need("VATA"), USDC=need("USDC_MINT");
const RAY_PROG=need("RAY_PROG"), RAY_POOL=need("RAY_POOL");
const TOKEN_PROG=new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync("./phantom-owner.json","utf8"))));
const cn=new Connection(RPC,"confirmed");

const [ORACLE]=PublicKey.findProgramAddressSync([Buffer.from("oracle"),RAY_POOL.toBuffer()],RAY_PROG);
const [OBS   ]=PublicKey.findProgramAddressSync([Buffer.from("observation"),RAY_POOL.toBuffer()],RAY_PROG);
const [BITMAP]=PublicKey.findProgramAddressSync([Buffer.from("pool_tick_array_bitmap_extension"),RAY_POOL.toBuffer()],RAY_PROG);
// try common PDAs that CLMMs use
const guessPDAs = [
  ["authority"],["pool_authority"],["config"],["amm_config"]
].map(([s])=>PublicKey.findProgramAddressSync([Buffer.from(s),RAY_POOL.toBuffer()],RAY_PROG)[0]);

const VAULT_A=opt("VAULT_A"), VAULT_B=opt("VAULT_B"), MINT_B=opt("MINT_B");

const idl=JSON.parse(fs.readFileSync(`idl/${PROGRAM.toBase58()}.json`,"utf8"));
const ixDef=idl.instructions.find(i=>["execute_route","executeRoute","execute"].includes(i.name));
if(!ixDef) throw new Error("execute_route not in IDL");
const flat=(a,o=[])=>{for(const x of a){o.push(x); if(x.accounts) flat(x.accounts,o);} return o;};
const defs=flat(ixDef.accounts);
const isCaller=(n)=>["caller","authority","owner","user","signer","executor"].includes(n.toLowerCase());
const mustW  =(n)=>/vault/.test(n.toLowerCase())||["global","pool"].includes(n.toLowerCase());
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
const base=defs.map(a=>({pubkey:mapName(a.name),isSigner:a.isSigner||isCaller(a.name),isWritable:a.isMut||mustW(a.name)}));

const backoff=async(fn)=>{let d=250;for(let i=0;i<6;i++){try{return await fn();}catch(e){if(i===5)throw e;await new Promise(r=>setTimeout(r,d));d=Math.min(d*2,1200);}}};

async function memcmpHunt(limit=80, offsets=[0,8,16,24,32,40]){
  const set=new Map();
  for(const off of offsets){
    const res=await backoff(()=>cn.getProgramAccounts(RAY_PROG,{
      commitment:"confirmed",
      dataSlice:{offset:0,length:0},
      filters:[{memcmp:{offset:off,bytes:RAY_POOL.toBase58()}}]
    }));
    for(const {pubkey} of res){ set.set(pubkey.toBase58(), pubkey); if(set.size>=limit) break; }
    if(set.size>=limit) break;
  }
  const list=[...set.values()], EXTRA=[];
  for(let i=0;i<list.length;i+=40){
    const chunk=list.slice(i,i+40);
    const infos=await backoff(()=>cn.getMultipleAccountsInfo(chunk,"confirmed"));
    for(let j=0;j<chunk.length;j++){
      const ai=infos[j]; if(!ai) continue;
      if(ai.owner.equals(RAY_PROG) && Buffer.from(ai.data).includes(Buffer.from(RAY_POOL.toBytes()))){
        EXTRA.push({pubkey:chunk[j],isSigner:false,isWritable:false});
      }
    }
  }
  return EXTRA;
}

(async()=>{
  const remFixed=[RAY_PROG,RAY_POOL,ORACLE,OBS,VAULT_A,VAULT_B,MINT_B,BITMAP,...guessPDAs]
    .filter(Boolean).map(x=>({pubkey:x,isSigner:false,isWritable:false}));
  const EXTRA = await memcmpHunt(200);
  console.log("Included EXTRA (owned by Raydium CLMM):");
  console.log(EXTRA.map(x=>x.pubkey.toBase58()).join("\\n")||"(none)");
  const keys=[...base,...remFixed,...EXTRA].slice(0,220);

  const disc=crypto.createHash("sha256").update("global:"+ixDef.name).digest().slice(0,8);
  const data=Buffer.concat([disc,Buffer.alloc(8,0),Buffer.alloc(4,0)]);
  const ix=new TransactionInstruction({programId:PROGRAM,keys,data});
  const tx=new Transaction().add(ix);
  tx.feePayer=payer.publicKey;
  const {blockhash}=await cn.getLatestBlockhash("confirmed");
  tx.recentBlockhash=blockhash;
  tx.sign(payer);

  const sig=await cn.sendRawTransaction(tx.serialize(),{skipPreflight:true});
  console.log("DRY–RUN SENT:",sig);
  console.log("Explorer: https://explorer.solana.com/tx/"+sig+"?cluster=devnet");
})().catch(e=>{console.error("error:",e.message); if(e.transactionLogs) console.error(e.transactionLogs.join("\\n"));});
