const fs=require('fs'), crypto=require('crypto');
const {Connection,PublicKey,Keypair,Transaction,TransactionInstruction,SystemProgram}=require('@solana/web3.js');
const need=(k)=>new PublicKey((process.env[k]||'').trim());
const opt =(k)=>process.env[k]?new PublicKey(process.env[k].trim()):null;

const PROGRAM=need('PROGRAM'), GLOBAL=need('GLOBAL'), POOL=need('POOL');
const VAPDA=need('VAPDA'), VATA=need('VATA'), USDC=need('USDC_MINT');
const RAY_PROG=need('RAY_PROG'), RAY_POOL=need('RAY_POOL');
const [ORACLE]=PublicKey.findProgramAddressSync([Buffer.from('oracle'),RAY_POOL.toBuffer()],RAY_PROG);
const [OBS]=PublicKey.findProgramAddressSync([Buffer.from('observation'),RAY_POOL.toBuffer()],RAY_PROG);
const [BITMAP]=PublicKey.findProgramAddressSync([Buffer.from('pool_tick_array_bitmap_extension'),RAY_POOL.toBuffer()],RAY_PROG);
const VAULT_A=opt('VAULT_A'), VAULT_B=opt('VAULT_B'), MINT_B=opt('MINT_B');

const TOKEN_PROG=new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const RPC=process.env.RPC||'https://api.devnet.solana.com';
const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('./phantom-owner.json','utf8'))));
const cn=new Connection(RPC,'confirmed');

const idl=JSON.parse(fs.readFileSync(`idl/${PROGRAM.toBase58()}.json`,'utf8'));
const ix=idl.instructions.find(i=>['execute_route','executeRoute','execute'].includes(i.name));
if(!ix) throw new Error('execute_route not in IDL');

const alias=(n)=>{
  const k=n.replace(/[^a-z]/gi,'').toLowerCase();
  if(['global','globalstate','globalconfig'].includes(k)) return GLOBAL;
  if(['pool','poolstate','poolconfig'].includes(k)) return POOL;
  if(['caller','authority','owner','user','signer','executor'].includes(k)) return payer.publicKey;
  if(['vault','vaultstate','vaultata','vata'].includes(k)) return VATA;          // map both to VATA
  if(['vaultauthority','vaultauth','vapda'].includes(k)) return VAPDA;
  if(['mint','usdc','quotemint'].includes(k)) return USDC;
  if(['tokenprogram'].includes(k)) return TOKEN_PROG;
  if(['systemprogram'].includes(k)) return SystemProgram.programId;
  throw new Error('No mapping for IDL account '+n);
};
const flatten=(a,o=[])=>{for(const x of a){o.push(x); if(x.accounts) flatten(x.accounts,o);} return o;};
const defs=flatten(ix.accounts);
const mustWrite=(n)=>/vault/.test(n.toLowerCase())||['global','pool'].includes(n.toLowerCase()); // force vault* writable

const keys=defs.map(a=>{
  const pk=alias(a.name);
  const isSigner=a.isSigner || ['caller','authority','owner','user','signer','executor'].includes(a.name.toLowerCase());
  const isWritable=a.isMut || mustWrite(a.name);
  return {pubkey:pk,isSigner,isWritable,name:a.name};
});

// instruction data: disc + principal=0 + route_len=0
const disc=crypto.createHash('sha256').update('global:'+ix.name).digest().slice(0,8);
const data=Buffer.concat([disc,Buffer.alloc(8,0),Buffer.alloc(4,0)]);

// fixed remaining accounts (read-only)
const rem=[RAY_PROG,RAY_POOL,ORACLE,OBS,VAULT_A,VAULT_B,MINT_B,BITMAP].filter(Boolean)
  .map(x=>({pubkey:x,isSigner:false,isWritable:false}));

(async()=>{
  const tix=new TransactionInstruction({programId:PROGRAM,keys:[...keys,...rem],data});
  const tx=new Transaction().add(tix);
  tx.feePayer=payer.publicKey;
  const {blockhash}=await cn.getLatestBlockhash('confirmed');
  tx.recentBlockhash=blockhash;
  tx.sign(payer);

  // debug print: show which meta is vault
  const v = keys.find(k=>/vault$/.test(k.name.toLowerCase())) || keys.find(k=>/vault/.test(k.name.toLowerCase()));
  if(v) console.log('vault ->', v.pubkey.toBase58(), 'writable=', v.isWritable);

  const sig=await cn.sendRawTransaction(tx.serialize(),{skipPreflight:true});
  console.log('DRY-RUN SENT:',sig);
  console.log('Explorer: https://explorer.solana.com/tx/'+sig+'?cluster=devnet');
})().catch(e=>{
  console.error('send error:', e.message);
  if(e.transactionLogs) console.error(e.transactionLogs.join('\n'));
});
