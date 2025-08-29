import {Connection,Keypair,PublicKey,TransactionInstruction,TransactionMessage,VersionedTransaction,sendAndConfirmTransaction} from "@solana/web3.js";
import crypto from "crypto";
import fs from "fs";

const pk = s => new PublicKey(String(s));
const disc8 = n => crypto.createHash("sha256").update("global:"+n).digest().subarray(0,8);

const PROGRAM = pk(process.env.PROGRAM);
const RPC = process.env.RPC || "https://api.devnet.solana.com";
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(process.env.SOLANA_KEYPAIR,"utf8"))));

const GLOBAL = pk(process.env.GLOBAL);
const POOL = pk(process.env.POOL);
const VAULT_AUTHORITY = pk(process.env.VAULT_AUTHORITY);
const VAULT = pk(process.env.VAULT);
const MINT = pk(process.env.MINT);
const TOKEN_PROG = pk(process.env.TOKEN_PROGRAM || "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const SYSVAR_RENT = pk("SysvarRent111111111111111111111111111111111");
const SYSTEM = pk("11111111111111111111111111111111");

const keys = [
  {pubkey: GLOBAL,          isSigner:false, isWritable:true},
  {pubkey: POOL,            isSigner:false, isWritable:true},
  {pubkey: VAULT_AUTHORITY, isSigner:false, isWritable:false},
  {pubkey: VAULT,           isSigner:false, isWritable:true},
  {pubkey: MINT,            isSigner:false, isWritable:false},
  {pubkey: TOKEN_PROG,      isSigner:false, isWritable:false},
  {pubkey: SYSVAR_RENT,     isSigner:false, isWritable:false},
  {pubkey: SYSTEM,          isSigner:false, isWritable:false},
];

const data = Buffer.concat([disc8("execute_route"), Buffer.alloc(8,0), Buffer.alloc(4,0)]);
const ix = new TransactionInstruction({ programId: PROGRAM, keys, data });

const conn = new Connection(RPC, "confirmed");
const {blockhash,lastValidBlockHeight} = await conn.getLatestBlockhash("confirmed");

const msg = new TransactionMessage({
  payerKey: payer.publicKey,
  recentBlockhash: blockhash,
  instructions: [ix],
}).compileToV0Message();

const vtx = new VersionedTransaction(msg);

const sim = await conn.simulateTransaction(vtx, {sigVerify:false, replaceRecentBlockhash:false});
console.log("SIM_OK="+String(sim.value && sim.value.err==null));
console.log("SIM_LOGS="+JSON.stringify(sim.value?.logs||[]));
if(sim.value && sim.value.err){ console.log("SIM_ERR="+JSON.stringify(sim.value.err)); process.exit(1); }

vtx.sign([payer]);
const sig = await sendAndConfirmTransaction(conn, vtx, {skipPreflight:false, commitment:"confirmed", minContextSlot:0, lastValidBlockHeight});
console.log("SIG="+sig);
console.log("EXPLORER=https://explorer.solana.com/tx/"+sig+"?cluster=devnet");
