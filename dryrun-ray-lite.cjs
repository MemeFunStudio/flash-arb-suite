const fs=require('fs'), crypto=require('crypto');
const {Connection,PublicKey,Keypair,Transaction,TransactionInstruction,SystemProgram}=require('@solana/web3.js');

const need=(k)=>{const v=process.env[k]; if(!v) throw new Error('Missing '+k); return new PublicKey(v.trim());};
const opt =(k)=>process.env[k]?new PublicKey(process.env[k].trim()):null;

// Your program
const PROGRAM=need('PROGRAM'), GLOBAL=need('GLOBAL'), POOL=need('POOL');
const VAPDA=need('VAPDA'), VATA=need('VATA'), USDC=need('USDC_MINT');

// Raydium
const RAY_PROG=need('RAY_PROG'), RAY_POOL=need('RAY_POOL');
const [ORACLE]=PublicKey.findProgramAddressSync([Buffer.from('oracle'),RAY_POOL.toBuffer()],RAY_PROG);
const [OBS]=PublicKey.findProgramAddressSync([Buffer.from('observation'),RAY_POOL.toBuffer()],RAY_PROG);
const [BITMAP]=PublicKey.findProgramAddressSync([Buffer.from('pool_tick_array_bitmap_extension'),RAY_POOL.toBuffer()],RAY_PROG);
const VAULT_A=opt('VAULT_A'), VAULT_B=opt('VAULT_B'), MINT_B=opt('MINT_B');

const TOKEN_PROG=new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const RPC=process.env.RPC||'https://api.devnet.solana.com';
const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('./phantom-owner.json','utf8'))));
const cn=new Connection(RPC,'confirmed');

// encode ix (principal=0, route_len=0)
const disc=crypto.createHash('sha256').update('global:execute_route').digest().slice(0,8);
const data=Buffer.concat([disc,Buffer.alloc(8,0),Buffer.alloc(4,0)]);

// account metas
const base=[
  {pubkey:GLOBAL,isSigner:false,isWritable:true},
  {pubkey:POOL,isSigner:false,isWritable:true},
  {pubkey:payer.publicKey,isSigner:true,isWritable:true}, // caller MUST be signer
  {pubkey:VATA,isSigner:false,isWritable:true},
  {pubkey:VAPDA,isSigner:false,isWritable:false},
  {pubkey:USDC,isSigner:false,isWritable:false},
  {pubkey:TOKEN_PROG,isSigner:false,isWritable:false},
  {pubkey:SystemProgram.programId,isSigner:false,isWritable:false},
];
const remFixed=[RAY_PROG,RAY_POOL,ORACLE,OBS,VAULT_A,VAULT_B,MINT_B,BITMAP]
  .filter(Boolean).map(x=>({pubkey:x,isSigner:false,isWritable:false}));

const ix=new TransactionInstruction({programId:PROGRAM, keys:[...base,...remFixed], data});
(async()=>{
  const tx=new Transaction().add(ix);
  tx.feePayer=payer.publicKey;
  const {blockhash}=await cn.getLatestBlockhash('confirmed');
  tx.recentBlockhash=blockhash;
  tx.sign(payer);

  // Assert: caller must be in the signer set
  const msg=tx.compileMessage();
  const signerKeys=msg.accountKeys.slice(0,msg.header.numRequiredSignatures).map(x=>x.toBase58());
  const caller=payer.publicKey.toBase58();
  if(!signerKeys.includes(caller)){
    console.error('ASSERT FAIL: caller is not a signer in message header');
    console.error('signers:', signerKeys);
    process.exit(1);
  }

  // Send raw (no preflight) → always a real on-chain sig
  const sig=await cn.sendRawTransaction(tx.serialize(),{skipPreflight:true});
  console.log('DRY-RUN SENT:',sig);
  console.log('Explorer: https://explorer.solana.com/tx/'+sig+'?cluster=devnet');
})().catch(e=>{
  console.error('send error:', e.message);
  if(e.transactionLogs) console.error(e.transactionLogs.join('\n'));
});
