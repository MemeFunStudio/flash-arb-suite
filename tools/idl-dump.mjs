import fs from 'fs';
import {PublicKey} from '@solana/web3.js';
import {getAssociatedTokenAddress} from '@solana/spl-token';

const env=process.env;
const paths=['idl.json','idl/flash_executor.json','target/idl/flash_executor.json'].filter(p=>fs.existsSync(p));
if(paths.length===0){console.log('IDL_PATH=NONE');process.exit(0);}

const idl=JSON.parse(fs.readFileSync(paths[0],'utf8'));
const ix=idl.instructions.find(i=>i.name==='create_pool'||i.name==='createPool');
console.log('IDL_PATH='+paths[0]);
console.log('IX_NAME='+ix.name);
console.log('ACCOUNTS_BEGIN');
ix.accounts.forEach(a=>console.log(a.name+':signer='+Boolean(a.isSigner)+':mut='+Boolean(a.isMut)));
console.log('ACCOUNTS_END');
console.log('ARGS_BEGIN');
(ix.args||[]).forEach(a=>console.log(a.name+':'+(typeof a.type==='string'?a.type:JSON.stringify(a.type))));
console.log('ARGS_END');

const PROGRAM=new PublicKey(env.PROGRAM);
const MINT=new PublicKey(env.MINT);
const OWNER=new PublicKey(env.OWNER||env.ANCHOR_WALLET);
const [POOL]=PublicKey.findProgramAddressSync([Buffer.from('pool'),MINT.toBuffer(),OWNER.toBuffer()],PROGRAM);
const [VA]=PublicKey.findProgramAddressSync([Buffer.from('vault_auth'),POOL.toBuffer()],PROGRAM);
const ata=await getAssociatedTokenAddress(MINT,VA,true);
console.log('POOL_DERIVED='+POOL.toBase58());
console.log('VAULT_AUTH_DERIVED='+VA.toBase58());
console.log('VAULT_ATA_EXPECTED='+ata.toBase58());
