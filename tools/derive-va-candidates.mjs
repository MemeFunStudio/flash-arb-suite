import {PublicKey} from '@solana/web3.js';
const env=process.env;
const PROGRAM=new PublicKey(env.PROGRAM);
const POOL=new PublicKey(env.POOL);
const MINT=new PublicKey(env.MINT);
const GLOBAL=new PublicKey(env.GLOBAL);
const OWNER=new PublicKey(env.OWNER);
function pda(seeds){return PublicKey.findProgramAddressSync(seeds,PROGRAM)[0].toBase58();}
const list=[];
list.push(['vault+POOL', pda([Buffer.from('vault'), POOL.toBuffer()])]);
list.push(['vault+POOL+MINT', pda([Buffer.from('vault'), POOL.toBuffer(), MINT.toBuffer()])]);
list.push(['vault+MINT+OWNER', pda([Buffer.from('vault'), MINT.toBuffer(), OWNER.toBuffer()])]);
list.push(['vault_authority+POOL', pda([Buffer.from('vault_authority'), POOL.toBuffer()])]);
list.push(['vault+GLOBAL+MINT', pda([Buffer.from('vault'), GLOBAL.toBuffer(), MINT.toBuffer()])]);
list.push(['vault+GLOBAL+POOL', pda([Buffer.from('vault'), GLOBAL.toBuffer(), POOL.toBuffer()])]);
for(const [label,addr] of list) console.log(label+'='+addr);
