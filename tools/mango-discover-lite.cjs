const {Connection, PublicKey} = require('@solana/web3.js');
const {getAccount} = require('@solana/spl-token');
const bs58 = require('bs58');

const RPC = process.env.RPC || 'https://api.devnet.solana.com';
const MANGO_PROGRAM_ID = new PublicKey(process.env.MANGO_PROGRAM_ID || '4MangoMjqJ2firMokCjjGgoK8d4MXcrgL7XJaL3w6fVg');
const USDC_DEV = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

function uniq(arr){ return Array.from(new Set(arr)); }
function toPkMaybe(buf, off){ try{ return new PublicKey(buf.subarray(off,off+32)); }catch{ return null; } }

(async () => {
  const conn = new Connection(RPC, 'confirmed');
  const accs = await conn.getProgramAccounts(MANGO_PROGRAM_ID, {commitment:'confirmed'});
  let bankAcc = null;
  for(const a of accs){
    const data = a.account.data;
    if(!Buffer.isBuffer(data) || data.length < 64) continue;
    let foundMint = false;
    for(let i=0;i<=data.length-32;i++){
      const pk = toPkMaybe(data,i);
      if(pk && pk.equals(USDC_DEV)){ foundMint = true; break; }
    }
    if(foundMint){ bankAcc = a; break; }
  }
  if(!bankAcc) throw new Error('USDC Bank not found on devnet');
  const bankData = bankAcc.account.data;
  const candidates = uniq((() => {
    const out = [];
    for(let i=0;i<=bankData.length-32;i++){
      const pk = toPkMaybe(bankData,i);
      if(pk) out.push(pk.toBase58());
    }
    return out;
  })());

  let vaultPk = null;
  for(const s of candidates){
    if(s === USDC_DEV.toBase58()) continue;
    const pk = new PublicKey(s);
    const info = await conn.getAccountInfo(pk, 'confirmed');
    if(info && info.owner.equals(TOKEN_PROGRAM_ID)){
      try{
        const ta = await getAccount(conn, pk, 'confirmed', TOKEN_PROGRAM_ID);
        if(ta.mint.toBase58() === USDC_DEV.toBase58()){ vaultPk = pk; break; }
      }catch{}
    }
  }
  if(!vaultPk) throw new Error('Could not identify USDC vault token account');

  let groupPk = null;
  for(const s of candidates){
    const pk = new PublicKey(s);
    if(pk.equals(USDC_DEV) || pk.equals(vaultPk) || pk.equals(bankAcc.pubkey)) continue;
    const info = await conn.getAccountInfo(pk, 'confirmed');
    if(info && info.owner.equals(MANGO_PROGRAM_ID)){ groupPk = pk; break; }
  }
  if(!groupPk) throw new Error('Could not identify Group reference from Bank');

  console.log('MANGO_PROGRAM_ID='+MANGO_PROGRAM_ID.toBase58());
  console.log('MANGO_GROUP='+groupPk.toBase58());
  console.log('MANGO_BANK='+bankAcc.pubkey.toBase58());
  console.log('MANGO_VAULT='+vaultPk.toBase58());
  console.log('EXPLORER_GROUP=https://explorer.solana.com/address/'+groupPk.toBase58()+'?cluster=devnet');
  console.log('EXPLORER_BANK=https://explorer.solana.com/address/'+bankAcc.pubkey.toBase58()+'?cluster=devnet');
  console.log('EXPLORER_VAULT=https://explorer.solana.com/address/'+vaultPk.toBase58()+'?cluster=devnet');
})();
