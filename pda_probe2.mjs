import { readFileSync } from 'fs';
import { PublicKey, Keypair } from '@solana/web3.js';
const PROGRAM_ID = new PublicKey('9ckBy54vd9G6FmR63Z4PoLtNq8rbtoYzhVbJGx458Kmn');
const OWNER  = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync('phantom-owner.json','utf8')))).publicKey;
const GLOBAL = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync('global.json','utf8')))).publicKey;
const MINT     = new PublicKey(process.env.MINT);
const EXPECTED = new PublicKey(process.env.EXPECTED); // “Left:” from logs

const pool = PublicKey.findProgramAddressSync([Buffer.from('pool'), MINT.toBuffer(), OWNER.toBuffer()], PROGRAM_ID)[0];

// seed dictionary (we can enlarge if needed)
const constSeeds = ['vault','vault_authority','authority','pool','global','owner','mint','VAULT','Vault'];
const dyn = [
  ['POOL',  pool.toBuffer()],
  ['MINT',  MINT.toBuffer()],
  ['OWNER', OWNER.toBuffer()],
  ['GLOBAL',GLOBAL.toBuffer()],
];

function* choose(arr, k, start=0, pick=[]) {
  if (pick.length===k) { yield pick; return; }
  for (let i=start;i<arr.length;i++) yield* choose(arr,k,i+1,[...pick,arr[i]]);
}
const items = [...constSeeds.map(s=>[`"${s}"`,Buffer.from(s)]), ...dyn];

let tried=0, found=null;
for (let len=1; len<=4; len++){
  for (const combo of choose(items,len)){
    // require at least one dynamic seed
    if (!combo.some(([name])=>['POOL','MINT','OWNER','GLOBAL'].includes(name))) continue;
    const labels = combo.map(([n])=>n);
    const seeds  = combo.map(([,b])=>b);
    const addr = PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
    tried++;
    if (addr.equals(EXPECTED)){ found={labels,addr}; break; }
  }
  if (found) break;
}
if (found){
  console.log('✅ MATCH'); 
  console.log('Seeds (order):', found.labels.join(' , '));
  console.log('Derived PDA   :', found.addr.toBase58());
}else{
  console.log(`No match in ${tried} combos. We can widen the dictionary next.`);
  console.log('Pool PDA:', pool.toBase58());
}
