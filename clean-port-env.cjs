const fs=require('fs'), os=require('os'); const p=os.homedir()+'/.flash-arb/devnet.env';
let t=fs.readFileSync(p,'utf8').replace(/\r/g,'');
t=t.replace(/^(PORT_(?:PROG|LENDING_MARKET|USDC_RESERVE|USDC_LIQ_SUPPLY))=(['"]?)([^'"\n\r]+)\2$/gm,
  (_,k,_q,v)=>`${k}='${v.trim()}'`);
fs.writeFileSync(p,t.trimEnd()+"\n"); console.log("cleaned",p);
