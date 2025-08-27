const fs=require("fs"); const {Connection,PublicKey,Keypair,Transaction,TransactionInstruction,SystemProgram}=require("@solana/web3.js");
const RPC=process.env.RPC||"https://api.devnet.solana.com";
const USDC=new PublicKey(process.env.USDC_MINT);
const VATA=new PublicKey(process.env.VATA);
const TOKEN=new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ATOKEN=new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
function loadKey(){ if(fs.existsSync("./phantom-owner.json")){const j=JSON.parse(fs.readFileSync("./phantom-owner.json","utf8")); if(j.secretKey) return Keypair.fromSecretKey(Buffer.from(j.secretKey,"base64")); if(Array.isArray(j)) return Keypair.fromSecretKey(new Uint8Array(j));} const p=process.env.HOME+"/.config/solana/id.json"; if(fs.existsSync(p)){return Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(p,"utf8"))));} throw new Error("no keypair");}
function u64le(n){const bn=BigInt(n); const b=Buffer.alloc(8); b.writeBigUInt64LE(bn); return b;}
(async()=>{
  const cn=new Connection(RPC,"confirmed"); const payer=loadKey();
  // derive owner USDC ATA
  const [ownerATA]=PublicKey.findProgramAddressSync([payer.publicKey.toBuffer(),TOKEN.toBuffer(),USDC.toBuffer()],ATOKEN);
  // create ATA ix if missing
  const ownerAtaInfo=await cn.getAccountInfo(ownerATA);
  const ixs=[];
  if(!ownerAtaInfo){
    ixs.push(new TransactionInstruction({programId:ATOKEN, keys:[
      {pubkey:payer.publicKey,isSigner:true,isWritable:true}, // payer
      {pubkey:ownerATA,isSigner:false,isWritable:true},       // ata
      {pubkey:payer.publicKey,isSigner:false,isWritable:false}, // owner
      {pubkey:USDC,isSigner:false,isWritable:false},          // mint
      {pubkey:SystemProgram.programId,isSigner:false,isWritable:false},
      {pubkey:TOKEN,isSigner:false,isWritable:false},
      {pubkey:new PublicKey("SysvarRent111111111111111111111111111111111"),isSigner:false,isWritable:false},
    ], data: Buffer.alloc(0)}));
  }
  // get balances
  const vBal = await cn.getTokenAccountBalance(VATA).catch(()=>null);
  const oBal = await cn.getTokenAccountBalance(ownerATA).catch(()=>null);
  const want = Number(process.env.AMOUNT_USDC||"5"); // default 5 USDC
  const decimals = 6; const amount = BigInt(Math.round(want*10**decimals));
  console.log("Vault USDC (before) =", vBal?.value?.amount||"0", "  Owner ATA =", ownerATA.toBase58(), "Owner USDC =", oBal?.value?.amount||"0");
  if(!oBal || BigInt(oBal.value.amount) < amount){
    console.log("\\nNot enough USDC in your owner ATA to seed the vault.");
    console.log("Send at least", want, "USDC (devnet) to:", ownerATA.toBase58());
    return;
  }
  // SPL Token transfer (instruction = 3)
  const TRANSFER=3;
  const data=Buffer.concat([Buffer.from([TRANSFER]), u64le(amount)]);
  ixs.push(new TransactionInstruction({programId:TOKEN, keys:[
    {pubkey:ownerATA,isSigner:false,isWritable:true},
    {pubkey:VATA,isSigner:false,isWritable:true},
    {pubkey:payer.publicKey,isSigner:true,isWritable:false},
  ], data}));
  const tx=new Transaction().add(...ixs); tx.feePayer=payer.publicKey;
  const {blockhash}=await cn.getLatestBlockhash("confirmed"); tx.recentBlockhash=blockhash; tx.sign(payer);
  const sig=await cn.sendRawTransaction(tx.serialize(),{skipPreflight:false});
  await cn.confirmTransaction(sig,"confirmed");
  console.log("\\nSEEDED:", sig, "\\nExplorer: https://explorer.solana.com/tx/"+sig+"?cluster=devnet");
  const vAfter = await cn.getTokenAccountBalance(VATA).catch(()=>null);
  console.log("Vault USDC (after)  =", vAfter?.value?.amount||"0");
})().catch(e=>{console.error("error:", e.message);});
