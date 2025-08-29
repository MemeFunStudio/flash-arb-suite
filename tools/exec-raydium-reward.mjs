import fs from "fs";
import {createHash} from "crypto";
import {Connection, Keypair, PublicKey, Transaction, TransactionInstruction} from "@solana/web3.js";

function disc(n){return createHash("sha256").update(`global:${n}`).digest().slice(0,8)}
function u32(n){const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b}
function u64(n){const b=Buffer.alloc(8);b.writeUInt32LE(n>>>0,0);b.writeUInt32LE(Math.floor(n/2**32)>>>0,4);return b}
function vecBytes(buf){return Buffer.concat([u32(buf.length),buf])}
function serMeta(pk,isSigner,isWritable){return Buffer.concat([new PublicKey(pk).toBuffer(),Buffer.from([isSigner?1:0]),Buffer.from([isWritable?1:0])])}
function serInstr(programId,metas,data){
  const mSer=Buffer.concat(metas.map(m=>serMeta(m.pubkey,m.isSigner,m.isWritable)));
  return Buffer.concat([new PublicKey(programId).toBuffer(),u32(metas.length),mSer,vecBytes(data)]);
}

const e=process.env;
const PROGRAM=new PublicKey(e.PROGRAM);
const GLOBAL=new PublicKey(e.GLOBAL);
const POOL=new PublicKey(e.POOL);
const VAULT_AUTH=new PublicKey(e.VAULT_AUTHORITY);
const VAULT=new PublicKey(e.VAULT);
const TOKEN_PROGRAM=new PublicKey(e.TOKEN_PROGRAM||"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const CLMM_PROG=new PublicKey(e.RAYDIUM_CLMM);
const CLMM_POOL=new PublicKey(e.CLMM_POOL);
const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(e.SOLANA_KEYPAIR,"utf8"))));
const conn=new Connection(e.DEVNET_RPC||"https://api.devnet.solana.com","confirmed");
const caller=payer.publicKey;

const clmmData=disc("update_reward_infos");
const clmmMetas=[{pubkey:CLMM_POOL,isSigner:false,isWritable:true}];
const clmmSer=serInstr(CLMM_PROG,clmmMetas,clmmData);
const routeSer=Buffer.concat([u32(1),clmmSer]);
const data=Buffer.concat([disc("execute_route"),u64(0),routeSer]);

const keysPrimary=[
  {pubkey:GLOBAL,isSigner:false,isWritable:true},
  {pubkey:POOL,isSigner:false,isWritable:true},
  {pubkey:VAULT_AUTH,isSigner:false,isWritable:false},
  {pubkey:VAULT,isSigner:false,isWritable:true},
  {pubkey:caller,isSigner:false,isWritable:false},
  {pubkey:TOKEN_PROGRAM,isSigner:false,isWritable:false},
];
const keysRemaining=[
  {pubkey:GLOBAL,isSigner:false,isWritable:false},
  {pubkey:POOL,isSigner:false,isWritable:false},
  {pubkey:VAULT,isSigner:false,isWritable:false},
  {pubkey:VAULT_AUTH,isSigner:false,isWritable:false},
  {pubkey:caller,isSigner:false,isWritable:false},
  {pubkey:TOKEN_PROGRAM,isSigner:false,isWritable:false},
  {pubkey:CLMM_PROG,isSigner:false,isWritable:false},
  {pubkey:CLMM_POOL,isSigner:false,isWritable:true},
];

const ix=new TransactionInstruction({programId:PROGRAM,keys:[...keysPrimary,...keysRemaining],data});
const tx=new Transaction().add(ix);
tx.feePayer=caller;

(async()=>{
  tx.recentBlockhash=(await conn.getLatestBlockhash("confirmed")).blockhash;
  tx.sign(payer);
  try{await conn.simulateTransaction(tx,{sigVerify:true,replaceRecentBlockhash:true})}catch(_){}
  const sig=await conn.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:3});
  await conn.confirmTransaction(sig,"confirmed");
  console.log("CLMM_POOL="+CLMM_POOL.toBase58());
  console.log("RAYDIUM_EXECUTE_SIG="+sig);
  console.log("EXPLORER=https://explorer.solana.com/tx/"+sig+"?cluster=devnet");
})().catch(e=>{console.log("RAYDIUM_EXECUTE_ERROR="+e);process.exit(1)});
