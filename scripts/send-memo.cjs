const fs=require('fs');
const {Connection,PublicKey,Keypair,Transaction,TransactionInstruction}=require('@solana/web3.js');

const RPC=(process.env.RPC||'https://api.devnet.solana.com').trim();
const TARGET=((process.env.PROG||process.env.PROGRAM||process.env.TARGET||'')+'').trim();
if(!TARGET){console.error('ERR: missing PROG');process.exit(2);}

const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('./phantom-owner.json','utf8'))));
const MEMO_PROG=new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

(async()=>{
  const cn=new Connection(RPC,'confirmed');
  const ix=new TransactionInstruction({
    programId:MEMO_PROG,
    keys:[
      {pubkey:payer.publicKey,isSigner:true,isWritable:false},
      {pubkey:new PublicKey(TARGET),isSigner:false,isWritable:false},
    ],
    data:Buffer.from('smoke:'+Date.now()),
  });
  const tx=new Transaction().add(ix);
  tx.feePayer=payer.publicKey;
  const {blockhash}=await cn.getLatestBlockhash('confirmed');
  tx.recentBlockhash=blockhash;
  tx.sign(payer);
  const sig=await cn.sendRawTransaction(tx.serialize(),{skipPreflight:true});
  console.log(sig);
  console.log('https://explorer.solana.com/tx/'+sig+'?cluster=devnet');
})();
