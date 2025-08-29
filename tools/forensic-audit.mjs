import {Connection, PublicKey} from '@solana/web3.js';
import crypto from 'crypto';
import {getAssociatedTokenAddress, TOKEN_PROGRAM_ID as SPL} from '@solana/spl-token';
const env=process.env;
const conn=new Connection(env.DEVNET_RPC,'confirmed');
const PROGRAM=new PublicKey(env.PROGRAM);
const MINT=new PublicKey(env.MINT);
const OWNER=new PublicKey(env.OWNER);
function disc(name){return crypto.createHash('sha256').update('account:'+name).digest().slice(0,8)}
const D_GLOBAL=disc('GlobalConfig');
const D_POOL=disc('TokenPool');
const gas=await conn.getProgramAccounts(PROGRAM);
let foundGlobal=[], foundPools=[];
for(const g of gas){
  const d=g.account.data?.slice(0,8)??Buffer.alloc(0);
  if(d.equals(D_GLOBAL)) foundGlobal.push(g.pubkey.toBase58());
  if(d.equals(D_POOL)) foundPools.push(g.pubkey.toBase58());
}
const [POOL]=PublicKey.findProgramAddressSync([Buffer.from('pool'), MINT.toBuffer(), OWNER.toBuffer()], PROGRAM);
const [VA]=PublicKey.findProgramAddressSync([Buffer.from('vault_auth'), POOL.toBuffer()], PROGRAM);
const ATA=await getAssociatedTokenAddress(MINT, VA, true);
async function info(pk){
  const ai=await conn.getAccountInfo(new PublicKey(pk));
  return {exists:!!ai, owner:ai?ai.owner.toBase58():'', dlen:ai?ai.data.length:0}
}
const rPOOL=await info(POOL.toBase58());
const rVA=await info(VA.toBase58());
const rATA=await conn.getParsedAccountInfo(ATA);
console.log('FOUND_GLOBAL='+JSON.stringify(foundGlobal));
console.log('FOUND_POOLS='+JSON.stringify(foundPools));
console.log('DERIVED_POOL='+POOL.toBase58());
console.log('DERIVED_VAULT_AUTH='+VA.toBase58());
console.log('EXPECTED_VAULT_ATA='+ATA.toBase58());
console.log('POOL_STATE='+JSON.stringify(rPOOL));
console.log('VAULT_AUTH_STATE='+JSON.stringify(rVA));
console.log('VAULT_ATA_PARSE='+JSON.stringify(rATA.value,null,2));
