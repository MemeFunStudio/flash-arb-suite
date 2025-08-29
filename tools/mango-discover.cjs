const fs = require('fs');
const {Connection, PublicKey} = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');

const RPC = process.env.RPC || 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey(process.env.MANGO_PROGRAM_ID || '4MangoMjqJ2firMokCjjGgoK8d4MXcrgL7XJaL3w6fVg');
const USDC_DEV = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

const idl = JSON.parse(fs.readFileSync('idl/mango_v4.json','utf8'));
const coder = new anchor.BorshAccountsCoder(idl);
const conn = new Connection(RPC, 'confirmed');

(async () => {
  const accs = await conn.getProgramAccounts(PROGRAM_ID, {commitment:'confirmed'});
  const groups = [];
  const banks = [];
  for(const a of accs){
    const data = a.account.data;
    try{ const g = coder.decode('Group', data); groups.push({pubkey:a.pubkey.toBase58(), data:g}); continue; }catch{}
    try{ const b = coder.decode('Bank', data); banks.push({pubkey:a.pubkey.toBase58(), data:b}); continue; }catch{}
  }
  if(groups.length === 0){ throw new Error('No Group accounts found'); }
  let usdcBank = null;
  for(const b of banks){
    const d = b.data;
    const cands = [d.mint, d.tokenMint, d.assetMint, d.baseMint, d.mintPk, d.token].map(x => x && String(x)).filter(Boolean);
    if(cands.some(s => s === USDC_DEV.toBase58())){ usdcBank = b; break; }
  }
  if(!usdcBank){ throw new Error('USDC devnet Bank not found'); }
  const vCands = [usdcBank.data.vault, usdcBank.data.tokenVault, usdcBank.data.vaultPk, usdcBank.data.vaults && usdcBank.data.vaults[0]].map(x => x && new PublicKey(String(x))).filter(Boolean);
  if(vCands.length === 0){ throw new Error('Could not locate vault field on Bank'); }
  const VAULT = vCands[0].toBase58();
  const groupPk = groups[0].pubkey;
  console.log('MANGO_PROGRAM_ID='+PROGRAM_ID.toBase58());
  console.log('MANGO_GROUP='+groupPk);
  console.log('MANGO_BANK='+usdcBank.pubkey);
  console.log('MANGO_VAULT='+VAULT);
  console.log('EXPLORER_GROUP=https://explorer.solana.com/address/'+groupPk+'?cluster=devnet');
  console.log('EXPLORER_BANK=https://explorer.solana.com/address/'+usdcBank.pubkey+'?cluster=devnet');
  console.log('EXPLORER_VAULT=https://explorer.solana.com/address/'+VAULT+'?cluster=devnet');
})();
