import { readFileSync } from 'fs';
import { PublicKey, Keypair } from '@solana/web3.js';

const PROGRAM_ID = new PublicKey('9ckBy54vd9G6FmR63Z4PoLtNq8rbtoYzhVbJGx458Kmn');
const OWNER  = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync('phantom-owner.json','utf8')))).publicKey;
const GLOBAL = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync('global.json','utf8')))).publicKey;

const MINT     = new PublicKey(process.env.MINT);        // required
const EXPECTED = new PublicKey(process.env.EXPECTED);    // the “Left:” PDA from your logs

const [POOL, POOL_BUMP] = PublicKey.findProgramAddressSync(
  [Buffer.from('pool'), MINT.toBuffer(), OWNER.toBuffer()],
  PROGRAM_ID
);

const bump = Uint8Array.from([POOL_BUMP]);

const CONSTS = [
  'vault','vault_authority','authority',
  'pool','global','owner','mint',
  'Vault','VAULT','vaultAuthority','pool_vault','poolvault','vaultauth'
];

const ITEMS = [
  ...CONSTS.map(s => [`"${s}"`, Buffer.from(s)]),
  ['POOL',  POOL.toBuffer()],
  ['MINT',  MINT.toBuffer()],
  ['OWNER', OWNER.toBuffer()],
  ['GLOBAL',GLOBAL.toBuffer()],
  ['POOL_BUMP', bump],
];

function* perms(items, len, prefix=[]) {
  if (prefix.length === len) { yield prefix; return; }
  for (const it of items) yield* perms(items, len, [...prefix, it]);
}

console.log('Owner       :', OWNER.toBase58());
console.log('Global      :', GLOBAL.toBase58());
console.log('Mint        :', MINT.toBase58());
console.log('Pool PDA    :', POOL.toBase58());
console.log('Pool bump   :', POOL_BUMP);
console.log('Expected PDA:', EXPECTED.toBase58());
console.log('Searching permutations incl. bump…');

let tried = 0, found = null;

outer:
for (let len=2; len<=4; len++) { // at least 2 seeds is most common
  for (const combo of perms(ITEMS, len)) {
    if (!combo.some(([n]) => ['POOL','MINT','OWNER','GLOBAL'].includes(n))) continue;
    const labels = combo.map(([n])=>n);
    const seeds  = combo.map(([,b])=>b);
    const addr = PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
    tried++;
    if (addr.equals(EXPECTED)) { found = { labels, addr }; break outer; }
  }
}

if (found) {
  console.log('✅ MATCH');
  console.log('Seeds (order):', found.labels.join(' , '));
  console.log('Derived PDA   :', found.addr.toBase58());
} else {
  console.log(`No match in ${tried} permutations. We can widen further (global bump, more labels) if needed.`);
}
