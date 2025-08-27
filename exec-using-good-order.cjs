const fs=require("fs"),crypto=require("crypto");
const {Connection,PublicKey,Keypair,Transaction,TransactionInstruction,SystemProgram}=require("@solana/web3.js");

// env helpers
const need=k=>new PublicKey((process.env[k]||"").trim());
const RPC=process.env.RPC||"https://devnet.helius-rpc.com/?api-key=37658bc7-5bd1-47f4-ad34-56b7a125011d";

// core env
const PROGRAM=need("PROGRAM"), GLOBAL=need("GLOBAL"), POOL=need("POOL");
const VAPDA=need("VAPDA"), VATA=need("VATA"), USDC=need("USDC_MINT");
const TOKEN_PROG=new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

// payer + conn
const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync("./phantom-owner.json","utf8"))));
const cn=new Connection(RPC,"confirmed");

// build base from IDL (exact order)
const idlPath="idl/"+PROGRAM.toBase58()+".json";
if(!fs.existsSync(idlPath)){ console.error("IDL missing at "+idlPath); process.exit(1); }
const idl=JSON.parse(fs.readFileSync(idlPath,"utf8"));
const ixDef=idl.instructions.find(i=>["execute_route","executeRoute","execute"].includes(i.name));
if(!ixDef){ console.error("execute_route not in IDL"); process.exit(1); }
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

// pull ORDERED_* from env (saved good order), then de-dup vs base
const ord=[];
for(const [k,v] of Object.entries(process.env)){
  const m=k.match(/^ORDERED_(\d+)$/); if(!m) continue;
  ord[Number(m[1])] = v;
}
const orderedRaw = ord.filter(Boolean).map(s=>new PublicKey(s));
const seen=new Set(base.map(a=>a.pubkey.toBase58()));
const rem=[];
for(const pk of orderedRaw){ const b=pk.toBase58(); if(seen.has(b)) continue; seen.add(b); rem.push({pubkey:pk,isSigner:false,isWritable:false}); if(rem.length>=200) break; }

// ix data: discriminator + principal=0 + route_len=0  (true dry-run path)
const disc=crypto.createHash("sha256").update("global:"+ixDef.name).digest().slice(0,8);
const data=Buffer.concat([disc,Buffer.alloc(8,0),Buffer.alloc(4,0)]);

(async()=>{
  const ix=new TransactionInstruction({programId:PROGRAM,keys:[...base,...rem],data});
  const tx=new Transaction().add(ix);
  tx.feePayer=payer.publicKey;
  const {blockhash}=await cn.getLatestBlockhash("confirmed");
  tx.recentBlockhash=blockhash;
  tx.sign(payer);
  const sig=await cn.sendRawTransaction(tx.serialize(),{skipPreflight:true});
  console.log("DRY-RUN SENT:",sig);
  console.log("Explorer: https://explorer.solana.com/tx/"+sig+"?cluster=devnet");
})();
