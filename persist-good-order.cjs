const fs=require("fs");const {Connection,PublicKey}=require("@solana/web3.js");
const RPC=process.env.RPC||"https://devnet.helius-rpc.com/?api-key=37658bc7-5bd1-47f4-ad34-56b7a125011d";
const PROGRAM=new PublicKey(process.env.PROGRAM.trim());
const idl=JSON.parse(fs.readFileSync("idl/"+PROGRAM.toBase58()+".json","utf8"));
const ixDef=idl.instructions.find(i=>["execute_route","executeRoute","execute"].includes(i.name));
if(!ixDef){console.error("execute_route not in IDL");process.exit(1);}
const flat=(a,o=[])=>{for(const x of a){o.push(x); if(x.accounts) flat(x.accounts,o);} return o;};
const baseLen=flat(ixDef.accounts).length; // your declared accounts count
(async()=>{
  const cn=new Connection(RPC,"confirmed");
  const tx=await cn.getTransaction(process.argv[2],{maxSupportedTransactionVersion:0});
  if(!tx){console.error("tx not found");process.exit(1);}
  const keys=tx.transaction.message.accountKeys.map(k=>new PublicKey(k.toString()));
  const ix=tx.transaction.message.instructions[0];
  const order=ix.accounts.map(i=>keys[i].toBase58());
  const remaining=order.slice(baseLen); // everything after the base accounts we passed
  const dir=`${process.env.HOME}/.flash-arb`;
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(`${dir}/ray-good-order.json`,JSON.stringify({sig:process.argv[2],baseLen,remaining},null,2));
  // also write to env as ORDERED_* (we won’t overwrite existing EXTRA_*)
  const envPath=`${dir}/devnet.env`;
  let env=fs.existsSync(envPath)?fs.readFileSync(envPath,"utf8"):"";
  env=env.split("\n").filter(l=>!/^ORDERED_\d+=/.test(l)).join("\n").trimEnd();
  const lines=remaining.map((a,i)=>`ORDERED_${i+1}=${a}`).join("\n");
  fs.writeFileSync(envPath,(env?env+"\n":"")+lines+"\n");
  console.log(`Saved ${remaining.length} ordered accounts to ${dir}/ray-good-order.json and ORDERED_* in devnet.env`);
})();JS
set -a && source ~/.flash-arb/devnet.env && set +a && node persist-good-order.cjs "$SIG"
