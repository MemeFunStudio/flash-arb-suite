import fs from 'fs';
import {createHash} from 'crypto';
import {Connection, Keypair, PublicKey, Transaction, TransactionInstruction} from '@solana/web3.js';

const e=process.env;
const conn=new Connection(e.DEVNET_RPC||'https://api.devnet.solana.com','confirmed');
const PROGRAM=new PublicKey(e.PROGRAM);
const GLOBAL=new PublicKey(e.GLOBAL);
const POOL=new PublicKey(e.POOL);
const TOKEN_PROG=new PublicKey(e.TOKEN_PROGRAM||'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const VAULT=new PublicKey(e.VAULT);
const MINT=new PublicKey(e.MINT);
const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(e.SOLANA_KEYPAIR,'utf8'))));
const [VA]=PublicKey.findProgramAddressSync([Buffer.from('vault_auth'), POOL.toBuffer()], PROGRAM);

const sighash=(n)=>createHash('sha256').update(`global:${n}`).digest().slice(0,8);
const leU32=(n)=>{const b=Buffer.alloc(4); b.writeUInt32LE(n>>>0); return b;};
const leU64=(n)=>{const b=Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b;};
const serBool=(b)=>Buffer.from([b?1:0]);
const serPub=(pk)=>pk.toBytes();

// Anchor-like serialization for:
// SerializedAccountMeta { pubkey: Pubkey, is_signer: bool, is_writable: bool }
// SerializedInstruction  { program_id: Pubkey, metas: Vec<SerializedAccountMeta>, data: Vec<u8> }
// route: Vec<SerializedInstruction>
function serAccountMeta({pubkey,is_signer,is_writable}){
  return Buffer.concat([ serPub(pubkey), serBool(is_signer), serBool(is_writable) ]);
}
function serVec(buffers){
  return Buffer.concat([ leU32(buffers.length), ...buffers ]);
}
function serVecU8(bytes){
  return Buffer.concat([ leU32(bytes.length), Buffer.from(bytes) ]);
}
function serInstruction({program_id, metas, data}){
  return Buffer.concat([
    serPub(program_id),
    serVec(metas.map(serAccountMeta)),
    serVecU8(data)
  ]);
}

// SPL-Token Transfer instruction: tag=3, amount: u64 LE
const TOKEN_IX_TRANSFER = 3;
const amount = 0; // keep balances unchanged for dry-run
const data = Buffer.concat([ Buffer.from([TOKEN_IX_TRANSFER]), leU64(amount) ]);

// Build one CPI step: source=VAULT (w), dest=VAULT (w), owner=VA (signer)
const step = {
  program_id: TOKEN_PROG,
  metas: [
    {pubkey: VAULT, is_signer: false, is_writable: true},
    {pubkey: VAULT, is_signer: false, is_writable: true},
    {pubkey: VA,    is_signer: true,  is_writable: false},
  ],
  data
};

const routeBytes = serVec([ serInstruction(step) ]);
const principal = 0; // your profit check uses min_profit_bps=0, so OK
const executeData = Buffer.concat([ sighash('execute_route'), leU64(principal), routeBytes ]);

// Declared accounts (IDL order): global, pool, vault_authority, vault, caller, token_program
const declared = [
  {pubkey:GLOBAL,isSigner:false,isWritable:true},
  {pubkey:POOL,isSigner:false,isWritable:true},
  {pubkey:VA,isSigner:false,isWritable:false},
  {pubkey:VAULT,isSigner:false,isWritable:true},
  {pubkey:payer.publicKey,isSigner:true,isWritable:true},
  {pubkey:TOKEN_PROG,isSigner:false,isWritable:false},
];

// Remaining accounts MUST include the same six (your handler enforces this)
const remaining = [
  {pubkey:GLOBAL,isSigner:false,isWritable:false},
  {pubkey:POOL,isSigner:false,isWritable:false},
  {pubkey:VAULT,isSigner:false,isWritable:true},
  {pubkey:VA,isSigner:false,isWritable:false},
  {pubkey:payer.publicKey,isSigner:false,isWritable:false},
  {pubkey:TOKEN_PROG,isSigner:false,isWritable:false},
];

const ix = new TransactionInstruction({ programId: PROGRAM, keys:[...declared,...remaining], data: executeData });
const tx = new Transaction().add(ix);
tx.feePayer = payer.publicKey;
tx.recentBlockhash = (await conn.getLatestBlockhash('confirmed')).blockhash;
tx.sign(payer);

const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight:false, maxRetries:3 });
await conn.confirmTransaction(sig,'confirmed');

console.log('EXECUTE_TOKEN0_SIG='+sig);
console.log('EXPLORER=https://explorer.solana.com/tx/'+sig+'?cluster=devnet');
