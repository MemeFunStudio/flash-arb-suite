import fs from 'fs';
import {createHash} from 'crypto';
import {Connection, Keypair, PublicKey, Transaction, TransactionInstruction} from '@solana/web3.js';

const e=process.env;
const conn=new Connection(e.RPC||e.DEVNET_RPC||'https://api.devnet.solana.com','confirmed');
function mustPk(name){let v=e[name]; if(!v) throw new Error('MISSING_'+name); v=String(v).trim(); try{ return new PublicKey(v);}catch{ throw new Error('INVALID_'+name+':'+v); }}
const PROGRAM=mustPk('PROGRAM');
const GLOBAL=mustPk('GLOBAL');
if(!e.SOLANA_KEYPAIR) throw new Error('MISSING_SOLANA_KEYPAIR');
const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(e.SOLANA_KEYPAIR,'utf8'))));
const OWNER=(e.OWNER?new PublicKey(String(e.OWNER).trim()):payer.publicKey);

const DEFAULTS={
  devnet:[
    'DRaybByLpbUL57LJARs3j8BitTxVfzBg351EaMr5UTCd',
    'DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb',
    'DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH',
  ],
  mainnet:[
    'routeUGWgWzqBWFcrCfv8tritsqukccJPu3q5GPP3xS',
    'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',
    'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'
  ]
};

const cluster=(e.CLUSTER||'devnet').toLowerCase();
let ids=[...DEFAULTS[cluster]];
if(e.WHITELIST_IDS && e.WHITELIST_IDS.trim().length){
  ids.push(...e.WHITELIST_IDS.split(',').map(s=>s.trim()).filter(Boolean));
}
const enable=String(e.WHITELIST_ENABLE||'true').toLowerCase()!=='false';

const sighash=(n)=>createHash('sha256').update(`global:${n}`).digest().slice(0,8);
const u8=(b)=>Buffer.from([b?1:0]);

async function setOne(pidStr){
  const pid=new PublicKey(pidStr);
  const data=Buffer.concat([sighash('set_whitelist'), pid.toBytes(), u8(enable)]);
  const keys=[
    {pubkey:GLOBAL,isSigner:false,isWritable:true},
    {pubkey:OWNER,isSigner:true,isWritable:true},
  ];
  const ix=new TransactionInstruction({programId:PROGRAM,keys,data});
  const tx=new Transaction().add(ix);
  tx.feePayer=payer.publicKey;
  tx.recentBlockhash=(await conn.getLatestBlockhash('confirmed')).blockhash;
  tx.sign(payer);
  const sig=await conn.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:3});
  await conn.confirmTransaction(sig,'confirmed');
  console.log('WHITELISTED='+pidStr+' SIG='+sig+' EXPLORER=https://explorer.solana.com/tx/'+sig+'?cluster='+(cluster==='mainnet'?'':'devnet'));
}

(async()=>{
  for(const id of ids){ await setOne(id); }
  console.log('DONE_CLUSTER='+cluster);
})();
