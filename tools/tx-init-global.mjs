import fs from 'fs';
import {createHash} from 'crypto';
import {Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction} from '@solana/web3.js';

const env = process.env;
const PROGRAM = new PublicKey(env.PROGRAM);              // 9ckBy54vd9… (your current)
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(env.SOLANA_KEYPAIR,'utf8'))));
const OWNER  = new PublicKey(env.OWNER || payer.publicKey.toBase58());

// PDA: [ "global" ]
const [GLOBAL] = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAM);

// Anchor sighash("initialize_global")
const sighash = (name) => createHash('sha256').update(`global:${name}`).digest().slice(0,8);
const data = Buffer.concat([sighash('initialize_global'), OWNER.toBytes()]);

// Correct metas: global=writable, payer=signer+writable, system=readonly
const keys = [
  {pubkey: GLOBAL,              isSigner: false, isWritable: true},
  {pubkey: payer.publicKey,     isSigner: true,  isWritable: true},
  {pubkey: SystemProgram.programId, isSigner: false, isWritable: false},
];

const conn = new Connection(env.DEVNET_RPC, 'confirmed');
const ix = new TransactionInstruction({ programId: PROGRAM, keys, data });
const tx = new Transaction().add(ix);
tx.feePayer = payer.publicKey;
tx.recentBlockhash = (await conn.getLatestBlockhash('confirmed')).blockhash;
tx.sign(payer);

const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight:false, maxRetries:3 });
await conn.confirmTransaction(sig,'confirmed');

const info = await conn.getAccountInfo(GLOBAL,'confirmed');
console.log('GLOBAL='+GLOBAL.toBase58());
console.log('GLOBAL_CREATE_SIG='+sig);
console.log('EXPLORER=https://explorer.solana.com/tx/'+sig+'?cluster=devnet');
console.log('GLOBAL_DLEN='+(info?info.data.length:0));
