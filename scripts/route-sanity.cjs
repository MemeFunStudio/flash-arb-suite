const fs=require("fs");
const os=require("os");
const {Connection,PublicKey,Keypair,Transaction,TransactionInstruction,sendAndConfirmTransaction}=require("@solana/web3.js");

function loadEnv(p){
  const t=fs.readFileSync(p,"utf8").split("\n");
  const m={}; for(const l of t){const i=l.indexOf("="); if(i>0){const k=l.slice(0,i).trim(); const v=l.slice(i+1).trim(); if(k) m[k]=v;}}
  return m;
}

(async()=>{
  const ENV_PATH=process.env.ENV||os.homedir()+"/.flash-arb/devnet.env";
  const env=loadEnv(ENV_PATH);

  const RPC=(env.RPC||"").trim();
  const PROGRAM=new PublicKey(env.PROGRAM);
  const GLOBAL=new PublicKey(env.GLOBAL);
  const POOL=new PublicKey(env.POOL);
  const VAULT_AUTHORITY=new PublicKey(env.VAULT_AUTHORITY);
  const VAULT=new PublicKey(env.VAULT);
  const CALLER=new PublicKey(env.CALLER);
  const TOKEN_PROG=new PublicKey(env.TOKEN_PROGRAM||"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  const SYSVAR_RENT=new PublicKey(env.SYSVAR_RENT||"SysvarRent111111111111111111111111111111111");
  const SYSTEM=new PublicKey("11111111111111111111111111111111");

  const payerRaw=JSON.parse(fs.readFileSync("./phantom-owner.json","utf8"));
  const sk=Array.isArray(payerRaw.secretKey)?payerRaw.secretKey:payerRaw;
  const payer=Keypair.fromSecretKey(Uint8Array.from(sk));

  const conn=new Connection(RPC,"confirmed");
  const disc=Buffer.from([246,14,81,121,140,237,86,23]);
  const data=Buffer.concat([disc,Buffer.alloc(8,0),Buffer.alloc(4,0)]);

  const base=[
    {pubkey:GLOBAL,isSigner:false,isWritable:true},
    {pubkey:POOL,isSigner:false,isWritable:true},
    {pubkey:VAULT_AUTHORITY,isSigner:false,isWritable:false},
    {pubkey:VAULT,isSigner:false,isWritable:true},
    {pubkey:CALLER,isSigner:true,isWritable:false},
    {pubkey:TOKEN_PROG,isSigner:false,isWritable:false},
  ];

  const rem=[];
  const pushU=(pk,w)=>{const b=pk.toBase58(); if(!rem.some(x=>x.pubkey.toBase58()===b)) rem.push({pubkey:pk,isSigner:false,isWritable:!!w});};
  for(const m of base) pushU(m.pubkey,m.isWritable);
  pushU(SYSVAR_RENT,false);
  pushU(SYSTEM,false);
  for(const [k,v] of Object.entries(env)){
    if(/^EXTRA_\d+$/.test(k) && v && v.length>=32 && v.length<=44){
      pushU(new PublicKey(v),false);
    }
  }

  const keys=[...base,...rem];
  const ix=new TransactionInstruction({programId:PROGRAM,keys,data});
  const tx=new Transaction().add(ix);
  tx.feePayer=payer.publicKey;
  tx.recentBlockhash=(await conn.getLatestBlockhash("confirmed")).blockhash;

  const sig=await sendAndConfirmTransaction(conn,tx,[payer],{commitment:"confirmed"});
  console.log(sig);
})().catch(e=>{console.error("send error:",e.message);process.exit(1);});
