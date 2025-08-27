import { readFileSync } from 'fs';
import { PublicKey, Keypair } from '@solana/web3.js';

const PROGRAM_ID = new PublicKey('9ckBy54vd9G6FmR63Z4PoLtNq8rbtoYzhVbJGx458Kmn');
const OWNER = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync('phantom-owner.json','utf8')))).publicKey;
const GLOBAL = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync('global.json','utf8')))).publicKey;

const MINT = new PublicKey(process.env.MINT);            // required
const EXPECTED = process.env.EXPECTED && new PublicKey(process.env.EXPECTED); // optional: the "Left:" from logs

function pda(label, seeds) {
  return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
}

// pool PDA per IDL (this one succeeded earlier)
const pool = pda('pool', [Buffer.from('pool'), MINT.toBuffer(), OWNER.toBuffer()]);

const candidates = [
  ['vault',                [Buffer.from('vault'), pool.toBuffer()]],
  ['vault_authority+pool', [Buffer.from('vault_authority'), pool.toBuffer()]],
  ['vault+mint',           [Buffer.from('vault'), MINT.toBuffer()]],
  ['vault+mint+owner',     [Buffer.from('vault'), MINT.toBuffer(), OWNER.toBuffer()]],
  ['vault+pool+mint',      [Buffer.from('vault'), pool.toBuffer(), MINT.toBuffer()]],
  ['vault+global',         [Buffer.from('vault'), GLOBAL.toBuffer()]],
  ['vault+global+mint',    [Buffer.from('vault'), GLOBAL.toBuffer(), MINT.toBuffer()]],
  ['authority+pool',       [Buffer.from('authority'), pool.toBuffer()]],
  ['auth+pool',            [Buffer.from('auth'), pool.toBuffer()]],
];

console.log('Owner   :', OWNER.toBase58());
console.log('Global  :', GLOBAL.toBase58());
console.log('Mint    :', MINT.toBase58());
console.log('Pool PDA:', pool.toBase58());
if (EXPECTED) console.log('Expected (from logs):', EXPECTED.toBase58());
console.log('---- candidates ----');

let matched = false;
for (const [name, seeds] of candidates) {
  const a = pda(name, seeds);
  const hit = EXPECTED && a.equals(EXPECTED);
  console.log(`${hit ? '✅' : '  '} ${name.padEnd(18)} -> ${a.toBase58()}`);
  if (hit) matched = true;
}
if (EXPECTED && !matched) console.log('No match yet — we can try more patterns.');
