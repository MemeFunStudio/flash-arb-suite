const fs=require("fs"),crypto=require("crypto");
const {Connection,PublicKey,Keypair,Transaction,TransactionInstruction,SystemProgram}=require("@solana/web3.js");

// env → pubkeys
const need=k=>new PublicKey((process.env[k]||"").trim());
const opt =k=>process.env[k]?new PublicKey(process.env[k].trim()):null;

const RPC=process.env.RPC||"https://devnet.helius-rpc.com/?api-key=37658bc7-5bd1-47f4-ad34-56b7a125011d";
const PROGRAM=need("PROGRAM"), GLOBAL=need("GLOBAL"), POOL=need("POOL");
const VAPDA=need("VAPDA"), VATA=need("VATA"), USDC=need("USDC_MINT");
const RAY_PROG=need("RAY_PROG"), RAY_POOL=need("RAY_POOL");
const TOKEN_PROG=new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync("./phantom-owner.json","utf8"))));
const cn=new Connection(RPC,"confirmed");

// ---- Build base from IDL (declared accounts)
const idlPath="idl/"+PROGRAM.toBase58()+".json";
if(!fs.existsSync(idlPath)){ console.error("IDL missing at "+idlPath); process.exit(1); }
const idl=JSON.parse(fs.readFileSync(idlPath,"utf8"));
const ixDef=idl.instructions.find(i=>["execute_route","executeRoute","execute"].includes(i.name));
if(!ixDef){ console.error("execute_route not found in IDL"); process.exit(1); }
const flat=(a,o=[])=>{for(const x of a){o.push(x); if(x.accounts) flat(x.accounts,o);} return o;};
const defs=flat(ixDef.accounts);
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

// ---- IMPORTANT: your program REQUIRES these to also be in `remaining_accounts`
const requiredInRem=[
  GLOBAL,           // global
  POOL,             // pool
  VAPDA,            // vault_authority
  VATA,             // vault (ATA)
  payer.publicKey,  // caller
  TOKEN_PROG        // token_program
].map(pk=>({pubkey:pk,isSigner:false,isWritable:false}));

// ---- Raydium fixed + extras (owned by Raydium)
const preferred=[RAY_PROG,RAY_POOL,opt("ORACLE"),opt("OBS"),opt("BITMAP"),opt("VAULT_A"),opt("VAULT_B"),opt("MINT_B")]
  .filter(Boolean).map(pk=>({pubkey:pk,isSigner:false,isWritable:false}));

// Pull EXTRA_* from env (append after preferred)
const extras=[];
for (const [k,v] of Object.entries(process.env)) {
  if(/^EXTRA_\d+$/.test(k) && v && v.length>=32 && v.length<=44) {
    extras.push({pubkey:new PublicKey(v),isSigner:false,isWritable:false});
  }
}
// de-dup while preserving order
const seen=new Set();
function pushUniq(dst, items){
  for(const it of items){
    const b=it.pubkey.toBase58(); if(seen.has(b)) continue; seen.add(b); dst.push(it);
    if(dst.length>=210) break;
  }
}
const rem=[]; pushUniq(rem, requiredInRem); pushUniq(rem, preferred); pushUniq(rem, extras);

// ---- ix data: discriminator + principal=0 + route_len=0
const disc=crypto.createHash("sha256").update("global:"+ixDef.name).digest().slice(0,8);
const data=Buffer.concat([disc,Buffer.alloc(8,0),Buffer.alloc(4,0)]);

const ix=new TransactionInstruction({programId:PROGRAM,keys:[...base,...rem],data});
const tx=new Transaction().add(ix);
tx.feePayer=payer.publicKey;
(async()=>{
  const {blockhash}=await cn.getLatestBlockhash("confirmed");
  tx.recentBlockhash=blockhash;
  tx.sign(payer);
  const sig=await cn.sendRawTransaction(tx.serialize(),{skipPreflight:true});
  console.log("DRY-RUN SENT:",sig);
  console.log("Explorer: https://explorer.solana.com/tx/"+sig+"?cluster=devnet");
})().catch(e=>{console.error("send error:",e.message); if(e.transactionLogs) console.error(e.transactionLogs.join("\n"));});
