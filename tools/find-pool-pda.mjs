import {PublicKey, Connection} from '@solana/web3.js';
const PROGRAM=new PublicKey(process.env.PROGRAM);
const GLOBAL=new PublicKey(process.env.GLOBAL);
const MINT=new PublicKey(process.env.MINT);
const OWNER=new PublicKey(process.env.OWNER);
const AUTH=new PublicKey(process.env.VAULT_AUTHORITY);

const conn=new Connection(process.env.DEVNET_RPC||'https://api.devnet.solana.com','confirmed');
const seedsList=[
  [Buffer.from('pool'), GLOBAL.toBuffer()],
  [Buffer.from('pool'), GLOBAL.toBuffer(), MINT.toBuffer()],
  [Buffer.from('pool'), MINT.toBuffer(), GLOBAL.toBuffer()],
  [Buffer.from('POOL'), GLOBAL.toBuffer()],
  [Buffer.from('Pool'), GLOBAL.toBuffer()],
  [Buffer.from('pool'), GLOBAL.toBuffer(), OWNER.toBuffer()],
  [Buffer.from('pool'), OWNER.toBuffer(), GLOBAL.toBuffer()],
  [Buffer.from('pool'), GLOBAL.toBuffer(), AUTH.toBuffer()]
];

(async ()=>{
  for(const seeds of seedsList){
    const [pda,bump]=PublicKey.findProgramAddressSync(seeds,PROGRAM);
    const ai=await conn.getAccountInfo(pda);
    const owner=ai?ai.owner.toBase58():'';
    const len=ai?ai.data.length:0;
    const tag=ai? (owner===PROGRAM.toBase58()?'EXISTS_OUR_PROGRAM':'EXISTS_OTHER'):'MISSING';
    console.log('CANDIDATE='+pda.toBase58()+' BUMP='+bump+' STATUS='+tag+' LEN='+len);
  }
})();
