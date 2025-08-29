import fs from 'fs';
import {createHash} from 'crypto';
import {Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction} from '@solana/web3.js';
import {getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID as SPL_TOKEN_PROGRAM_ID} from '@solana/spl-token';

function sighash(n){return createHash('sha256').update(`global:${n}`).digest().slice(0,8);}
function u16(n){const b=Buffer.alloc(2);b.writeUInt16LE(Number(n));return b;}
function pk(v){return new PublicKey(v).toBuffer();}

const env=process.env;
const rpc=env.DEVNET_RPC||'https://api.devnet.solana.com';
const conn=new Connection(rpc,'confirmed');
const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(env.SOLANA_KEYPAIR,'utf8'))));

const PROGRAM=new PublicKey(env.PROGRAM);
const GLOBAL=new PublicKey(env.GLOBAL);
const MINT=new PublicKey(env.MINT);
const TOKEN_PROGRAM=new PublicKey(env.TOKEN_PROGRAM||SPL_TOKEN_PROGRAM_ID.toBase58());
const SYSVAR_RENT=new PublicKey(env.SYSVAR_RENT||'SysvarRent111111111111111111111111111111111');
const OWNER=new PublicKey(env.OWNER||payer.publicKey.toBase58());

// POOL = ["pool", MINT, OWNER]; VAULT_AUTH = ["vault_auth", POOL]
const [POOL]=PublicKey.findProgramAddressSync([Buffer.from('pool'), MINT.toBuffer(), OWNER.toBuffer()], PROGRAM);
const [VAULT_AUTHORITY]=PublicKey.findProgramAddressSync([Buffer.from('vault_auth'), POOL.toBuffer()], PROGRAM);
const VAULT=await getAssociatedTokenAddress(MINT, VAULT_AUTHORITY, true, TOKEN_PROGRAM, ASSOCIATED_TOKEN_PROGRAM_ID);

// Ensure vault ATA exists
const ai=await conn.getAccountInfo(VAULT);
if(!ai){
  const tx1=new Transaction().add(
    createAssociatedTokenAccountInstruction(payer.publicKey, VAULT, VAULT_AUTHORITY, MINT, TOKEN_PROGRAM, ASSOCIATED_TOKEN_PROGRAM_ID)
  );
  tx1.feePayer=payer.publicKey;
  const {blockhash}=await conn.getLatestBlockhash('confirmed'); tx1.recentBlockhash=blockhash; tx1.sign(payer);
  const sig1=await conn.sendRawTransaction(tx1.serialize(),{skipPreflight:true,maxRetries:3});
  await conn.confirmTransaction(sig1,'confirmed');
  console.log('ATA_CREATE_SIG='+sig1);
  console.log('ATA_EXPLORER=https://explorer.solana.com/tx/'+sig1+'?cluster=devnet');
}

// Build ix with POOL forced writable (and NOT signer), VAULT_AUTHORITY read-only
const keys=[
  {pubkey:GLOBAL,isSigner:false,isWritable:true},
  {pubkey:POOL,isSigner:false,isWritable:true},                 // <-- force writable
  {pubkey:VAULT_AUTHORITY,isSigner:false,isWritable:false},     // PDA, never signer
  {pubkey:VAULT,isSigner:false,isWritable:true},
  {pubkey:MINT,isSigner:false,isWritable:false},
  {pubkey:TOKEN_PROGRAM,isSigner:false,isWritable:false},
  {pubkey:SYSVAR_RENT,isSigner:false,isWritable:false},
  {pubkey:SystemProgram.programId,isSigner:false,isWritable:false},
  // Owner/payer signer if your IDL expects it
  {pubkey:OWNER,isSigner:true,isWritable:false}
];

const data=Buffer.concat([sighash('create_pool'), u16(Number(env.MIN_PROFIT_BPS||5))]);

const ix=new TransactionInstruction({programId:PROGRAM,keys,data});
const tx=new Transaction().add(ix);
tx.feePayer=payer.publicKey;
const {blockhash}=await conn.getLatestBlockhash('confirmed'); tx.recentBlockhash=blockhash; tx.sign(payer);
const sig=await conn.sendRawTransaction(tx.serialize(),{skipPreflight:true,maxRetries:3});
await conn.confirmTransaction(sig,'confirmed');

// Verify POOL now exists and is owned by PROGRAM with non-zero data
const pinfo=await conn.getAccountInfo(POOL);
const ok=!!(pinfo && pinfo.owner.equals(PROGRAM) && pinfo.data && pinfo.data.length>0);

console.log('VAULT_AUTHORITY='+VAULT_AUTHORITY.toBase58());
console.log('VAULT='+VAULT.toBase58());
console.log('POOL='+POOL.toBase58());
console.log('POOL_CREATE_SIG='+sig);
console.log('EXPLORER=https://explorer.solana.com/tx/'+sig+'?cluster=devnet');
console.log('POOL_OWNER='+(pinfo?pinfo.owner.toBase58():''));
console.log('POOL_DATALEN='+(pinfo?pinfo.data.length:0));
console.log('POOL_OK='+(ok?'YES':'NO'));
