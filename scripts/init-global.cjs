const fs=require("fs");
const crypto=require("crypto");
const {Connection,Keypair,PublicKey,Transaction,SystemProgram}=require("@solana/web3.js");
function disc(name){return crypto.createHash("sha256").update("global:"+name).digest().subarray(0,8)}
function u32(b){const a=new Uint8Array(32);b.toBuffer().copy(a);return a}
(async()=>{
  const RPC=process.env.RPC||"https://api.devnet.solana.com";
  const PROGRAM=new PublicKey(process.env.PROGRAM);
  const kpPath=process.env.SOLANA_KEYPAIR;
  const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(kpPath,"utf8"))));
  const gPath=process.env.GLOBAL_KEYPAIR|| (process.env.HOME+"/.flash-arb/keys/devnet-global.json");
  let gk;
  if(fs.existsSync(gPath)){ gk=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(gPath,"utf8")))); }
  else { gk=Keypair.generate(); fs.writeFileSync(gPath,JSON.stringify(Array.from(gk.secretKey))); }
  const connection=new Connection(RPC,"confirmed");
  const data=Buffer.concat([disc("initialize_global"), u32(payer.publicKey)]);
  const keys=[
    {pubkey:gk.publicKey,isSigner:true,isWritable:true},
    {pubkey:payer.publicKey,isSigner:true,isWritable:true},
    {pubkey:SystemProgram.programId,isSigner:false,isWritable:false}
  ];
  const ix={programId:PROGRAM,keys,data};
  const {blockhash,lastValidBlockHeight}=await connection.getLatestBlockhash("finalized");
  const tx=new Transaction({feePayer:payer.publicKey,blockhash,lastValidBlockHeight}).add(ix);
  tx.sign(payer,gk);
  const sig=await connection.sendRawTransaction(tx.serialize(),{skipPreflight:false});
  await connection.confirmTransaction({signature:sig,blockhash,lastValidBlockHeight},"confirmed");
  console.log("GLOBAL_ADDR="+gk.publicKey.toBase58());
  console.log("SIG_INIT_GLOBAL="+sig);
  console.log("GLOBAL_KEYPAIR="+gPath);
})().catch(e=>{console.error("INIT_GLOBAL_ERROR",e.message);process.exit(1)});
