import fs from 'fs';
import {Connection, Keypair, PublicKey, Transaction} from '@solana/web3.js';
import {getAssociatedTokenAddress, createAssociatedTokenAccountIdempotentInstruction} from '@solana/spl-token';

const e=process.env;
const conn=new Connection(e.DEVNET_RPC||'https://api.devnet.solana.com','confirmed');
const program=new PublicKey(e.PROGRAM);
const mint=new PublicKey(e.MINT);
const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(e.SOLANA_KEYPAIR,'utf8'))));
const owner=new PublicKey(e.OWNER||payer.publicKey.toBase58());

const [pool]=PublicKey.findProgramAddressSync([Buffer.from('pool'),mint.toBuffer(),owner.toBuffer()],program);
const [va]=PublicKey.findProgramAddressSync([Buffer.from('vault_auth'),pool.toBuffer()],program);
const ata=await getAssociatedTokenAddress(mint,va,true);

const ix=createAssociatedTokenAccountIdempotentInstruction(payer.publicKey,ata,va,mint);
const tx=new Transaction().add(ix);
tx.feePayer=payer.publicKey;
tx.recentBlockhash=(await conn.getLatestBlockhash('confirmed')).blockhash;
tx.sign(payer);

const sig=await conn.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:3});
await conn.confirmTransaction(sig,'confirmed');

console.log('POOL='+pool.toBase58());
console.log('VAULT_AUTHORITY='+va.toBase58());
console.log('VAULT='+ata.toBase58());
console.log('ATA_CREATE_SIG='+sig);
console.log('EXPLORER=https://explorer.solana.com/tx/'+sig+'?cluster=devnet');
