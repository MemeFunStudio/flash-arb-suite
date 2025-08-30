const fs=require('fs');
const {Connection,PublicKey}=require('@solana/web3.js');

const FILE=(process.env.FILE||'/tmp/ranked_wsol.txt').trim();
const RPC=(process.env.RPC||'https://solana-devnet.api.onfinality.io/public').trim();
const RAY_PROG=new PublicKey((process.env.RAY_PROG||'').trim());
const LIMIT=Math.min(parseInt(process.env.LIMIT||'180',10),1000);
const PAGES=Math.min(parseInt(process.env.PAGES||'2',10),10);

function readPools(){
  if(!fs.existsSync(FILE)) return [];
  const out=[];
  const lines=fs.readFileSync(FILE,'utf8').split('\n');
  for(const ln of lines){
    const m=ln.trim().match(/^([1-9A-HJ-NP-Za-km-z]{32,44})\b/);
    if(m) out.push(m[1]);
  }
  return out.slice(0,25);
}
function derive(pool){
  const p=new PublicKey(pool);
  const o=PublicKey.findProgramAddressSync([Buffer.from('oracle'),p.toBuffer()],RAY_PROG)[0].toBase58();
  const ob=PublicKey.findProgramAddressSync([Buffer.from('observation'),p.toBuffer()],RAY_PROG)[0].toBase58();
  return {o,ob};
}
function keysFromTx(tx){
  const set=new Set();
  const msg=tx.transaction.message;
  if(Array.isArray(msg.accountKeys)){
    for(const k of msg.accountKeys){ const s=(k.pubkey||k).toString(); if(s) set.add(s); }
  }
  const la=tx.meta&&tx.meta.loadedAddresses?tx.meta.loadedAddresses:null;
  if(la){
    for(const k of (la.writable||[])) set.add(k.toString());
    for(const k of (la.readonly||[])) set.add(k.toString());
  }
  return set;
}

(async()=>{
  const cn=new Connection(RPC,'confirmed');
  const pools=readPools();
  for(const POOL of pools){
    let before=null;
    for(let page=0; page<PAGES; page++){
      const sigs=await cn.getSignaturesForAddress(new PublicKey(POOL),{limit:LIMIT,before}).catch(()=>null);
      if(!sigs||!sigs.length) break;
      before=sigs[sigs.length-1].signature;
      const want=derive(POOL);
      for(const s of sigs){
        const tx=await cn.getTransaction(s.signature,{maxSupportedTransactionVersion:0}).catch(()=>null);
        if(!tx||tx.meta&&tx.meta.err) continue;
        const set=keysFromTx(tx);
        if(set.has(want.o) && set.has(want.ob)){
          console.log('POOL='+POOL);
          console.log('TX='+s.signature);
          process.exit(0);
        }
      }
    }
  }
  console.log('NONE');
  process.exit(2);
})().catch(()=>{ console.log('NONE'); process.exit(1); });
