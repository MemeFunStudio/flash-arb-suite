const fs=require("fs");
const {Connection,PublicKey,Keypair,Transaction,TransactionInstruction}=require("@solana/web3.js");
const RPC=(process.env.RPC||"https://api.devnet.solana.com").trim();
const PROG=new PublicKey((process.env.PROG||"").trim());
const TARGET=new PublicKey((process.env.TARGET||"").trim());
const memo=new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync("./phantom-owner.json","utf8"))));
(async()=>{
  const cn=new Connection(RPC,"confirmed");
  const ix=new TransactionInstruction({programId:memo,keys:[
    {pubkey:PROG,isSigner:false,isWritable:false},
    {pubkey:TARGET,isSigner:false,isWritable:false}
  ],data:Buffer.from("SMOKE")});
  const tx=new Transaction().add(ix);
  tx.feePayer=payer.publicKey;
  const {blockhash}=await cn.getLatestBlockhash("confirmed");
  tx.recentBlockhash=blockhash;
  tx.sign(payer);
  const sig=await cn.sendRawTransaction(tx.serialize(),{skipPreflight:true});
  console.log(sig);
})();
