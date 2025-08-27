const fs = require('fs'), crypto = require('crypto');
const { Connection, PublicKey, Keypair, Transaction, TransactionInstruction, SystemProgram } = require('@solana/web3.js');

const need = k => new PublicKey((process.env[k] || '').trim());
const opt  = k => process.env[k] ? new PublicKey(process.env[k].trim()) : null;

const PROGRAM = need('PROGRAM'), GLOBAL = need('GLOBAL'), POOL = need('POOL');
const VAPDA   = need('VAPDA'),   VATA   = need('VATA'),   USDC = need('USDC_MINT');

const RAY_PROG = need('RAY_PROG'), RAY_POOL = need('RAY_POOL');
const [ORACLE] = PublicKey.findProgramAddressSync([Buffer.from('oracle'),     RAY_POOL.toBuffer()], RAY_PROG);
const [OBS]    = PublicKey.findProgramAddressSync([Buffer.from('observation'), RAY_POOL.toBuffer()], RAY_PROG);
const [BITMAP] = PublicKey.findProgramAddressSync([Buffer.from('pool_tick_array_bitmap_extension'), RAY_POOL.toBuffer()], RAY_PROG);

const VAULT_A = opt('VAULT_A'), VAULT_B = opt('VAULT_B'), MINT_B = opt('MINT_B');

// Optional pinned extras from env (EXTRA_1..EXTRA_6)
const EXTRAS = [1,2,3,4,5,6]
  .map(i => process.env['EXTRA_'+i])
  .filter(Boolean)
  .map(s => new PublicKey(s));

const TOKEN_PROG = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const RPC = process.env.RPC || 'https://api.devnet.solana.com';
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('./phantom-owner.json', 'utf8'))));
const cn = new Connection(RPC, 'confirmed');

// ---- Build accounts from IDL to match exact order
const idlPath = `idl/${PROGRAM.toBase58()}.json`;
if (!fs.existsSync(idlPath)) throw new Error(`IDL missing at ${idlPath}`);
const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
const ix = idl.instructions.find(i => ['execute_route','executeRoute','execute'].includes(i.name));
if (!ix) throw new Error('execute_route not found in IDL');

const flat = (arr, out=[]) => { for (const a of arr) { out.push(a); if (a.accounts) flat(a.accounts, out); } return out; };
const defs = flat(ix.accounts);

const isCaller = n => ['caller','authority','owner','user','signer','executor'].includes(n.toLowerCase());
const mustW    = n => /vault/.test(n.toLowerCase()) || ['global','pool'].includes(n.toLowerCase());
const mapName = n => {
  const k = n.replace(/[^a-z]/gi,'').toLowerCase();
  if (['global','globalstate','globalconfig'].includes(k)) return GLOBAL;
  if (['pool','poolstate','poolconfig'].includes(k))     return POOL;
  if (isCaller(k))                                       return payer.publicKey;
  if (['vault','vaultata','vata','vaultstate'].includes(k)) return VATA;
  if (['vaultauthority','vaultauth','vapda'].includes(k))   return VAPDA;
  if (['mint','usdc','quotemint'].includes(k))              return USDC;
  if (['tokenprogram'].includes(k))                         return TOKEN_PROG;
  if (['systemprogram'].includes(k))                        return SystemProgram.programId;
  throw new Error('No mapping for IDL account ' + n);
};

const base = defs.map(a => ({
  pubkey: mapName(a.name),
  isSigner: a.isSigner || isCaller(a.name),
  isWritable: a.isMut || mustW(a.name),
}));

// Discriminator + args (principal=0, route_len=0)
const disc = crypto.createHash('sha256').update('global:' + ix.name).digest().slice(0,8);
const data = Buffer.concat([disc, Buffer.alloc(8,0), Buffer.alloc(4,0)]);

// Put EXTRAS first (order-sensitive), then known fixeds
const rem = [...EXTRAS, RAY_PROG, RAY_POOL, ORACLE, OBS, VAULT_A, VAULT_B, MINT_B, BITMAP]
  .filter(Boolean)
  .map(x => ({ pubkey: x, isSigner: false, isWritable: false }));

(async () => {
  const tix = new TransactionInstruction({ programId: PROGRAM, keys: [...base, ...rem], data });
  const tx = new Transaction().add(tix);
  tx.feePayer = payer.publicKey;
  const { blockhash } = await cn.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.sign(payer);

  const sig = await cn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  console.log('DRY-RUN SENT:', sig);
  console.log('Explorer:', 'https://explorer.solana.com/tx/' + sig + '?cluster=devnet');
})();
