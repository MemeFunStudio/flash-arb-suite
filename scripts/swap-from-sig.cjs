const fs=require("fs"),crypto=require("crypto");
const {Connection,PublicKey,Keypair,Transaction,TransactionInstruction,SystemProgram}=require("@solana/web3.js");
function need(k){const v=(process.env[k]||"").trim();if(!v)throw new Error("Missing "+k);return new PublicKey(v)}
function opt(k){return process.env[k]?new PublicKey(process.env[k].trim()):null}
const RPC=(process.env.RPC||"https://devnet.helius-rpc.com/?api-key=37658bc7-5bd1-47f4-ad34-56b7a125011d").trim();
const WS=RPC.replace(/^http/,"ws");
const PROGRAM=need("PROGRAM"),GLOBAL=need("GLOBAL"),POOL=need("POOL"),VAPDA=need("VAPDA"),VATA=need("VATA"),USDC=need("USDC_MINT");
const RAY_PROG=need("RAY_PROG"),RAY_POOL=need("RAY_POOL");
const [ORACLE]=PublicKey.findProgramAddressSync([Buffer.from("oracle"),RAY_POOL.toBuffer()],RAY_PROG);
const [OBS]=PublicKey.findProgramAddressSync([Buffer.from("observation"),RAY_POOL.toBuffer()],RAY_PROG);
const [BITMAP]=PublicKey.findProgramAddressSync([Buffer.from("pool_tick_array_bitmap_extension"),RAY_POOL.toBuffer()],RAY_PROG);
const EXTRAS=[1,2,3,4,5,6].map(i=>process.env["EXTRA_"+i]).filter(Boolean).map(s=>new PublicKey(s));
const TOKEN_PROG=new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync("./phantom-owner.json","utf8"))));
const cn=new Connection(RPC,{commitment:"confirmed",wsEndpoint:WS});
const idlPath=`idl/${PROGRAM.toBase58()}.json`;
if(!fs.existsSync(idlPath)) throw new Error("IDL missing");
const idl=JSON.parse(fs.readFileSync(idlPath,"utf8"));
const ixDef=idl.instructions.find(i=>["execute_route","executeRoute","execute"].includes(i.name));
if(!ixDef) throw new Error("execute_route not found");
function flat(a,o=[]){for(const x of a){o.push(x);if(x.accounts)flat(x.accounts,o)}return o}
const defs=flat(ixDef.accounts);
function isCaller(n){n=n.toLowerCase();return["caller","authority","owner","user","signer","executor"].includes(n)}
function mustW(n){n=n.toLowerCase();return/vaul/.test(n)||["global","pool"].includes(n)}
function mapName(n){const k=n.replace(/[^a-z]/gi,"").toLowerCase();
  if(["global","globalstate","globalconfig"].includes(k))return GLOBAL;
  if(["pool","poolstate","poolconfig"].includes(k))return POOL;
  if(isCaller(k))return payer.publicKey;
  if(["vault","vaultata","vata","vaultstate"].includes(k))return VATA;
  if(["vaultauthority","vaultauth","vapda"].includes(k))return VAPDA;
  if(["mint","usdc","quotemint"].includes(k))return USDC;
  if(["tokenprogram"].includes(k))return TOKEN_PROG;
  if(["systemprogram"].includes(k))return SystemProgram.programId;
  throw new Error("No mapping for "+n);
}
const base=defs.map(a=>({pubkey:mapName(a.name),isSigner:a.isSigner||isCaller(a.name),isWritable:a.isMut||mustW(a.name)}));
const disc=crypto.createHash("sha256").update("global:"+ixDef.name).digest().slice(0,8);
const data=Buffer.concat([disc,Buffer.alloc(8,0),Buffer.alloc(4,0)]);
const TX=(process.env.TX||"").trim(); if(!TX) throw new Error("Missing TX");
function decode(tx){const m=tx.transaction.message;
  if("accountKeys" in m){return{keys:m.accountKeys.map(k=>new PublicKey(k.toString())),instr:m.instructions.map(ix=>({programIdIndex:ix.programIdIndex,accounts:ix.accounts}))}}
  const ck=m.getAccountKeys({accountKeysFromLookups:tx.meta?.loadedAddresses});
  const keys=[...ck.staticAccountKeys,...(ck.accountKeysFromLookups?.writable||[]),...(ck.accountKeysFromLookups?.readonly||[])];
  const ci=m.compiledInstructions||m.instructions||[];
  const instr=ci.map(ix=>({programIdIndex:ix.programIdIndex,accounts:(ix.accountKeyIndexes||ix.accounts||[])}));
  return {keys,instr}
}
(async()=>{
  const tx=await cn.getTransaction(TX,{maxSupportedTransactionVersion:0});
  if(!tx||tx.meta?.err) throw new Error("Bad TX");
  const {keys,instr}=decode(tx);
  const rayIdx=keys.findIndex(k=>k.equals(RAY_PROG)); if(rayIdx<0) throw new Error("No Raydium ix");
  const needSet=new Set([RAY_POOL.toBase58(),ORACLE.toBase58(),OBS.toBase58()]);
  let chosen=null;
  for(const ix of instr){if(ix.programIdIndex!==rayIdx)continue;
    const set=new Set(ix.accounts.map(i=>keys[i]?.toBase58()).filter(Boolean));
    let ok=true; for(const r of needSet){if(!set.has(r)){ok=false;break}}
    if(ok){chosen=ix;break}
  }
  if(!chosen) throw new Error("No swap-like ix for this pool");
  const baseSet=new Set(base.map(a=>a.pubkey.toBase58()));
  const ordered=[]; const push=(pk)=>{const b=pk.toBase58(); if(baseSet.has(b))return; if(ordered.some(x=>x.pubkey.toBase58()===b))return; ordered.push({pubkey:pk,isSigner:false,isWritable:false})};
  for(const e of EXTRAS) push(e);
  [ORACLE,OBS,BITMAP].forEach(x=>x&&push(x));
  for(const idx of chosen.accounts){const pk=keys[idx]; if(pk) push(pk)}
  const tix=new TransactionInstruction({programId:PROGRAM,keys:[...base,...ordered],data});
  const txo=new Transaction().add(tix);
  txo.feePayer=payer.publicKey;
  const {blockhash}=await cn.getLatestBlockhash("confirmed");
  txo.recentBlockhash=blockhash;
  txo.sign(payer);
  const sig=await cn.sendRawTransaction(txo.serialize(),{skipPreflight:true});
  console.log("DRY-RUN SENT:",sig);
  console.log("Explorer: https://explorer.solana.com/tx/"+sig+"?cluster=devnet");
})().catch(e=>{console.error("send error:",e.message); if(e.transactionLogs)console.error(e.transactionLogs.join("\n")); process.exit(1)});
