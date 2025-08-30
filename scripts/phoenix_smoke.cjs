const fs=require("fs");
const {Connection,PublicKey,Keypair,Transaction,TransactionInstruction}=require("@solana/web3.js");
const RPC=(process.env.RPC||"https://api.devnet.solana.com").trim();
const PROG=new PublicKey((process.env.PHX_PROG||"PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY").trim());
const MARKET=new PublicKey((process.env.PHX_MARKET||"").trim());
if(!MARKET) throw new Error("Missing PHX_MARKET");
const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync("./phantom-owner.json","utf8"))));
(async()=>{
  const cn=new Connection(RPC,"confirmed");
  const data=Buffer.from("PHX_SMOKE");
  const memo=new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
  const ix=new TransactionInstruction({
    programId:memo,
    keys:[
      {pubkey:PROG,isSigner:false,isWritable:false},
      {pubkey:MARKET,isSigner:false,isWritable:false},
    ],
    data
  });
  const tx=new Transaction().add(ix);
  tx.feePayer=payer.publicKey;
  const {blockhash}=await cn.getLatestBlockhash("confirmed");
  tx.recentBlockhash=blockhash;
  tx.sign(payer);
  const sig=await cn.sendRawTransaction(tx.serialize(),{skipPreflight:true});
  console.log(sig);
})();
