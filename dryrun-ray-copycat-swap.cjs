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

// Derive Raydium PDAs we expect in a swap
const [ORACLE]=PublicKey.findProgramAddressSync([Buffer.from("oracle"),RAY_POOL.toBuffer()],RAY_PROG);
const [OBS]   =PublicKey.findProgramAddressSync([Buffer.from("observation"),RAY_POOL.toBuffer()],RAY_PROG);
const [BITMAP]=PublicKey.findProgramAddressSync([Buffer.from("pool_tick_array_bitmap_extension"),RAY_POOL.toBuffer()],RAY_PROG);
const VAULT_A = opt("VAULT_A");
const VAULT_B = opt("VAULT_B");

// IDL → exact base account order
const idlPath="idl/"+PROGRAM.toBase58()+".json";
if(!fs.existsSync(idlPath)) { console.error("IDL missing at "+idlPath); process.exit(1); }
const idl=JSON.parse(fs.readFileSync(idlPath,"utf8"));
const ixDef=idl.instructions.find(i=>["execute_route","executeRoute","execute"].includes(i.name));
if(!ixDef) { console.error("execute_route not found in IDL"); process.exit(1); }
const flatten=(a,o=[])=>{for(const x of a){o.push(x); if(x.accounts) flatten(x.accounts,o);} return o;};
const defs=flatten(ixDef.accounts);
const isCaller=n=>["caller","authority","owner","user","signer","executor"].includes(n.toLowerCase());
const mustW  =n=>/vault/.test(n.toLowerCase())||["global","pool"].includes(n.toLowerCase());
const mapName=n=>{
  const k=n.replace(/[^a-z]/gi,"").toLowerCase();
  if(["global","globalstate","globalconfig"].includes(k)) return GLOBAL;
  if(["pool","poolstate","poolconfig"].includes(k))     return POOL;
  if(isCaller(k))                                       return payer.publicKey;
  if(["vault","vaultata","vata","vaultstate"].includes(k)) return VATA;
  if(["vaultauthority","vaultauth","vapda"].includes(k))   return VAPDA;
  if(["mint","usdc","quotemint"].includes(k))              return USDC;
  if(["tokenprogram"].includes(k))                         return TOKEN_PROG;
  if(["systemprogram"].includes(k))                        return SystemProgram.programId;
  throw new Error("No mapping for "+n);
};
const base=defs.map(a=>({pubkey:mapName(a.name),isSigner:a.isSigner||isCaller(a.name),isWritable:a.isMut||mustW(a.name)}));

// Decode legacy/v0
function decode(tx){
  const msg=tx.transaction.message;
  let keys=[], instr=[];
  if("accountKeys" in msg){
    keys = msg.accountKeys.map(k=>new PublicKey(k.toString()));
    instr = msg.instructions.map(ix=>({programIdIndex:ix.programIdIndex, accounts:ix.accounts}));
  }else{
    const ck=msg.getAccountKeys({accountKeysFromLookups: tx.meta?.loadedAddresses});
    keys=[...ck.staticAccountKeys, ...(ck.accountKeysFromLookups?.writable||[]), ...(ck.accountKeysFromLookups?.readonly||[])];
    const ci=msg.compiledInstructions||msg.instructions||[];
    instr=ci.map(ix=>({programIdIndex:ix.programIdIndex, accounts:(ix.accountKeyIndexes||ix.accounts||[])}));
  }
  return {keys,instr};
}

// Choose a Raydium ix that looks like a CLMM swap (must include pool+both vaults+oracle+obs)
async function pickSwapTemplate(){
  const required=[RAY_POOL,ORACLE,OBS].map(p=>p.toBase58());
  const sigs=await cn.getSignaturesForAddress(RAY_POOL,{limit:80});
  for(const s of sigs){
    const tx=await cn.getTransaction(s.signature,{maxSupportedTransactionVersion:0});
await new Promise(r=>setTimeout(r,150));
if(!tx || tx.meta?.err) continue;
    const {keys,instr}=decode(tx);
    const rayIndex = keys.findIndex(k=>k.equals(RAY_PROG));
    if(rayIndex<0) continue;
    for(const ix of instr.filter(ix=>ix.programIdIndex===rayIndex)){
      const set=new Set(ix.accounts.map(i=>keys[i]?.toBase58()).filter(Boolean));
      let ok=true; for(const r of required){ if(!set.has(r)){ ok=false; break; } }
      if(ok) return {keys, ix};
    }
  }
  return null;
}

(async()=>{
  const template=await pickSwapTemplate();
  if(!template){ console.error("No recent Raydium CLMM *swap-like* tx found on this pool."); process.exit(1); }
  const {keys,ix:rayIx}=template;

  const baseSet=new Set(base.map(a=>a.pubkey.toBase58()));
  const preferred=[ORACLE,OBS,BITMAP,VAULT_A,VAULT_B,opt("MINT_B")].filter(Boolean);
  const ordered=[], seen=new Set();

  for(const pk of preferred){ const b=pk.toBase58(); if(!seen.has(b) && !baseSet.has(b)){ seen.add(b); ordered.push({pubkey:pk,isSigner:false,isWritable:false}); } }
  for(const idx of rayIx.accounts){
    const pk=keys[idx]; if(!pk) continue;
    const b=pk.toBase58(); if(seen.has(b) || baseSet.has(b)) continue;
    seen.add(b); ordered.push({pubkey:pk,isSigner:false,isWritable:false});
    if(ordered.length>=200) break;
  }

  const disc=crypto.createHash("sha256").update("global:"+ixDef.name).digest().slice(0,8);
  const data=Buffer.concat([disc,Buffer.alloc(8,0),Buffer.alloc(4,0)]); // principal=0, route_len=0

  const tix=new TransactionInstruction({programId:PROGRAM, keys:[...base, ...ordered], data});
  const tx=new Transaction().add(tix);
  tx.feePayer=payer.publicKey;
  const {blockhash}=await cn.getLatestBlockhash("confirmed");
  tx.recentBlockhash=blockhash;
  tx.sign(payer);
  const sig=await cn.sendRawTransaction(tx.serialize(),{skipPreflight:true});
  console.log("DRY-RUN SENT:",sig);
  console.log("Explorer: https://explorer.solana.com/tx/"+sig+"?cluster=devnet");
})();
