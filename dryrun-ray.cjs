// dryrun-ray.js
const fs=require('fs'), crypto=require('crypto');
const {Connection,PublicKey,Keypair,Transaction,TransactionInstruction,SystemProgram}=require('@solana/web3.js');

const asPk = v => new PublicKey((v||'').trim());
const env = k => process.env[k] || (()=>{throw new Error('Missing env '+k)})();
const PROGRAM=asPk(env('PROGRAM'));
const GLOBAL =asPk(env('GLOBAL'));
const POOL   =asPk(env('POOL'));
const VAPDA  =asPk(env('VAPDA'));
const VATA   =asPk(env('VATA'));
const USDC   =asPk(env('USDC_MINT'));
const RAY_PROG=asPk(process.env.RAY_PROG||'DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH');
const RAY_POOL=asPk(env('RAY_POOL'));
const TOKEN_PROG=asPk('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const RPC=process.env.RPC||'https://api.devnet.solana.com';
const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('./phantom-owner.json','utf8'))));

const disc = n => crypto.createHash('sha256').update('global:'+n).digest().slice(0,8);
const cn = new Connection(RPC,'confirmed');

const sleep = ms => new Promise(r=>setTimeout(r,ms));
async function withBackoff(fn, label){
  let d=250;
  for(let i=0;i<6;i++){
    try { return await fn(); }
    catch(e){ if(i===5) throw e; await sleep(d); d=Math.min(d*2,1200); }
  }
}

// Sanity: derived VAPDA must match
const [expect] = PublicKey.findProgramAddressSync([Buffer.from('vault_auth'), POOL.toBuffer()], PROGRAM);
if (!expect.equals(VAPDA)) { console.error('Vault PDA mismatch', VAPDA.toBase58(), 'expected', expect.toBase58()); process.exit(1); }

// Raydium PDAs we know
const [ORACLE] = PublicKey.findProgramAddressSync([Buffer.from('oracle'), RAY_POOL.toBuffer()], RAY_PROG);
const [OBS]    = PublicKey.findProgramAddressSync([Buffer.from('observation'), RAY_POOL.toBuffer()], RAY_PROG);
const [BITMAP] = PublicKey.findProgramAddressSync([Buffer.from('pool_tick_array_bitmap_extension'), RAY_POOL.toBuffer()], RAY_PROG);

async function findVaultsAndMints(){
  const [pi] = await withBackoff(()=>cn.getMultipleAccountsInfo([RAY_POOL]),'pool');
  if(!pi) throw new Error('Raydium pool not found');
  const d=pi.data, out=[];
  for(let o=0;o<512 && out.length<6;o++){
    if(o+32>d.length) break;
    const cand=new PublicKey(d.subarray(o,o+32));
    const [ai] = await withBackoff(()=>cn.getMultipleAccountsInfo([cand]),'maybeVault');
    if(ai && ai.owner.equals(TOKEN_PROG) && ai.data.length>=165){
      const mint=new PublicKey(ai.data.subarray(0,32));
      out.push({vault:cand,mint});
    }
  }
  let VA=null,VB=null,MA=null,MB=null;
  for(const x of out){ if(x.mint.equals(USDC) && !VA){ VA=x.vault; MA=x.mint; } }
  for(const x of out){ if(!x.mint.equals(USDC) && !VB){ VB=x.vault; MB=x.mint; } }
  return {VA,VB,MA,MB};
}

async function collectLinked(limit=24){
  const known=new Set([RAY_POOL,ORACLE,OBS,BITMAP].map(x=>x.toBase58()));
  const bag=new Map();
  for(const off of [0,8,16,24,32,40]){
    await withBackoff(async ()=>{
      const res=await cn.getProgramAccounts(RAY_PROG,{commitment:'confirmed',dataSlice:{offset:0,length:0},filters:[{memcmp:{offset:off,bytes:RAY_POOL.toBase58()}}]});
      for(const {pubkey} of res){ const b=pubkey.toBase58(); if(!known.has(b)) bag.set(b,pubkey); if(bag.size>=limit) break; }
    },'scan@'+off);
    if(bag.size>=limit) break;
  }
  // Verify bytes really contain pool
  const bytes=Buffer.from(RAY_POOL.toBytes());
  const EXTRA=[], list=[...bag.values()];
  for(let i=0;i<list.length && EXTRA.length<limit;i+=40){
    const chunk=list.slice(i,i+40);
    const infos=await withBackoff(()=>cn.getMultipleAccountsInfo(chunk),'verify');
    for(let j=0;j<chunk.length;j++){
      const ai=infos[j]; if(!ai || !ai.owner.equals(RAY_PROG)) continue;
      if(Buffer.from(ai.data).includes(bytes)) EXTRA.push({pubkey:chunk[j],isSigner:false,isWritable:false});
    }
  }
  return EXTRA;
}

(async()=>{
  const idl=JSON.parse(fs.readFileSync(`idl/${PROGRAM.toBase58()}.json`,'utf8'));
  const ixDef=idl.instructions.find(i=>['execute_route','executeRoute','execute'].includes(i.name));
  if(!ixDef){ console.error('execute_route not found in IDL'); process.exit(1); }

  const {VA,VB,MA,MB}=await findVaultsAndMints();
  console.log('Raydium vaults:',{VAULT_A:VA?.toBase58(),VAULT_B:VB?.toBase58(),MINT_A:MA?.toBase58(),MINT_B:MB?.toBase58()});

  const EXTRA = await collectLinked(24);
  console.log('Linked (verified) count:',EXTRA.length);

  // IDL → required accounts
  const FORCE_W=new Set(['global','pool','vault','vault_ata','vata','vaultAta']);
  const map={
    global:GLOBAL, pool:POOL, caller:payer.publicKey,
    vault:VATA, vault_ata:VATA, vata:VATA, vaultAta:VATA,
    vault_authority:VAPDA, vaultAuth:VAPDA,
    mint:USDC, token_program:TOKEN_PROG,
    system_program:SystemProgram.programId, systemProgram:SystemProgram.programId,
  };
  const base=ixDef.accounts.map(a=>{
    const pk=map[a.name]; if(!pk){ console.error('No mapping for',a.name); process.exit(1); }
    return {pubkey:pk, isSigner:(a.name==='caller')||!!a.isSigner, isWritable:FORCE_W.has(a.name)||!!a.isMut};
  });

  // Minimal remaining set
  const remFixed=[RAY_PROG,RAY_POOL,ORACLE,OBS,VA,VB,MA,MB,TOKEN_PROG].filter(Boolean)
    .map(x=>({pubkey:x,isSigner:false,isWritable:false}));

  const keys=[...base,...remFixed,...EXTRA].slice(0,220);
  const data=Buffer.concat([disc('execute_route'),Buffer.alloc(8,0),Buffer.alloc(4,0)]); // principal=0, route_len=0
  const ix=new TransactionInstruction({programId:PROGRAM,keys,data});
  const tx=new Transaction().add(ix);

  try{
    const sig=await cn.sendTransaction(tx,[payer],{skipPreflight:false,preflightCommitment:'confirmed'});
    await cn.confirmTransaction(sig,'confirmed');
    console.log('DRY-RUN SENT:',sig,'\nExplorer: https://explorer.solana.com/tx/'+sig+'?cluster=devnet');
  }catch(e){
    console.log('\nSimulation error:', e.transactionMessage || e.message);
    if(e.transactionLogs) console.log('\nLogs:\n' + e.transactionLogs.join('\n'));
    console.log('\nIncluded EXTRA:\n' + EXTRA.map(x=>x.pubkey.toBase58()).join('\n'));
  }
})();
