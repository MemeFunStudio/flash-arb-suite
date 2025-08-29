import fs from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';

const e = process.env;
if (!e.PROGRAM) throw new Error('Missing PROGRAM');
if (!e.SOLANA_KEYPAIR) throw new Error('Missing SOLANA_KEYPAIR');

const conn = new Connection(e.DEVNET_RPC || 'https://api.devnet.solana.com','confirmed');
const PROGRAM = new PublicKey(e.PROGRAM);
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(e.SOLANA_KEYPAIR,'utf8'))));
const OWNER = new PublicKey(e.OWNER || payer.publicKey.toBase58());

const defaultPath = path.join(os.homedir(), '.flash-arb', 'keys', 'devnet-global.json');
const GLOBAL_KEYPAIR_PATH = e.GLOBAL_KEYPAIR_PATH || defaultPath;
fs.mkdirSync(path.dirname(GLOBAL_KEYPAIR_PATH), { recursive: true });
const globalKp = Keypair.generate();
fs.writeFileSync(GLOBAL_KEYPAIR_PATH, JSON.stringify(Array.from(globalKp.secretKey)));

function sighash(n){ return createHash('sha256').update(`global:${n}`).digest().slice(0,8); }
const data = Buffer.concat([sighash('initialize_global'), OWNER.toBuffer()]);

const keys = [
  { pubkey: globalKp.publicKey, isSigner: true,  isWritable: true  },
  { pubkey: payer.publicKey,    isSigner: true,  isWritable: true  },
  { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
];

const ix = new TransactionInstruction({ programId: PROGRAM, keys, data });
const tx = new Transaction().add(ix);
tx.feePayer = payer.publicKey;
tx.recentBlockhash = (await conn.getLatestBlockhash('confirmed')).blockhash;
tx.partialSign(payer, globalKp);

const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
await conn.confirmTransaction(sig,'confirmed');

const info = await conn.getAccountInfo(globalKp.publicKey,'confirmed');
console.log('GLOBAL='+globalKp.publicKey.toBase58());
console.log('GLOBAL_KEYPAIR='+GLOBAL_KEYPAIR_PATH);
console.log('INIT_GLOBAL_SIG='+sig);
console.log('EXPLORER=https://explorer.solana.com/tx/'+sig+'?cluster=devnet');
console.log('GLOBAL_DLEN='+(info?info.data.length:0));
