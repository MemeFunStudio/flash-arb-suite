const {Connection, PublicKey} = require('@solana/web3.js');
const {getAccount} = require('@solana/spl-token');

const RPC = process.env.RPC || 'https://api.devnet.solana.com';
const USDC_DEV = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

const CANDIDATE_PROGRAMS = [
  'Port7uDYvH7KZmfTnAqeiiPvZcdLXxax3CXG4DvdP8gz',
  'LendZqTs7gn5CTSJU1jWKhKuVpjJGom45nnwPb2AMTi',
  'TokenLending1111111111111111111111111111111'
].map(s => new PublicKey(s));

function toPk(buf, i){ try{ return new PublicKey(buf.subarray(i,i+32)); }catch{ return null; } }

(async () => {
  const conn = new Connection(RPC, 'confirmed');
  for(const PID of CANDIDATE_PROGRAMS){
    const list = await conn.getProgramAccounts(PID, {commitment:'confirmed'});
    for(const a of list){
      const data = a.account.data;
      if(!Buffer.isBuffer(data) || data.length < 64) continue;
      let hasUsdc=false;
      for(let i=0;i<=data.length-32;i++){ const pk=toPk(data,i); if(pk && pk.equals(USDC_DEV)){ hasUsdc=true; break; } }
      if(!hasUsdc) continue;

      const uniques = Array.from(new Set((() => {
        const out=[]; for(let i=0;i<=data.length-32;i++){ const pk=toPk(data,i); if(pk) out.push(pk.toBase58()); }
        return out;
      })()));

      let vault=null;
      for(const s of uniques){
        const pk = new PublicKey(s);
        if(pk.equals(USDC_DEV) || pk.equals(a.pubkey)) continue;
        const info = await conn.getAccountInfo(pk,'confirmed');
        if(!info || !info.owner.equals(TOKEN_PROGRAM_ID)) continue;
        try{
          const ta = await getAccount(conn, pk, 'confirmed', TOKEN_PROGRAM_ID);
          if(ta.mint.equals(USDC_DEV)){ vault = pk; break; }
        }catch{}
      }
      if(!vault) continue;

      console.log('PORT_PROGRAM_ID='+PID.toBase58());
      console.log('PORT_RESERVE='+a.pubkey.toBase58());
      console.log('PORT_VAULT='+vault.toBase58());
      console.log('EXPLORER_RESERVE=https://explorer.solana.com/address/'+a.pubkey.toBase58()+'?cluster=devnet');
      console.log('EXPLORER_VAULT=https://explorer.solana.com/address/'+vault.toBase58()+'?cluster=devnet');
      process.exit(0);
    }
  }
  console.log('NOT_FOUND=PORT_DEVNET_USDC');
  process.exit(0);
})();
