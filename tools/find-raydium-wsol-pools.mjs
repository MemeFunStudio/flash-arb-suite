import {Connection, PublicKey} from '@solana/web3.js';
const conn=new Connection(process.env.DEVNET_RPC||'https://api.devnet.solana.com','confirmed');
const CPMM=new PublicKey('DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb');
const CLMM=new PublicKey('DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH');
const WSOL=new PublicKey('So11111111111111111111111111111111111111112');
const bytes=WSOL.toBytes();
async function scan(owner,label){
  const list=await conn.getProgramAccounts(owner,{commitment:'confirmed',dataSlice:{offset:0,length:0}});
  const pick=list.slice(0,120);
  let n=0;
  for(const x of pick){
    const ai=await conn.getAccountInfo(x.pubkey,'confirmed');
    if(!ai?.data) continue;
    if(Buffer.from(ai.data).includes(Buffer.from(bytes))){
      console.log(label+'='+x.pubkey.toBase58());
      n++;
    }
  }
  if(n===0) console.log('NONE_'+label);
}
await scan(CPMM,'CANDIDATE_CPMM');
await scan(CLMM,'CANDIDATE_CLMM');
