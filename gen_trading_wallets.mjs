import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'fs';
import path from 'path';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

const args = process.argv.slice(2);
const getFlag = (name, def=null) => {
  const i = args.findIndex(a => a === `--${name}`);
  if (i === -1) return def;
  const v = args[i+1];
  if (!v || v.startsWith('--')) return true;
  return v;
};

const COUNT   = Number(getFlag('count', 12));
const TAG     = String(getFlag('tag', 'rotation'));
const DIR     = String(getFlag('dir', 'wallets'));
const CLUSTER = String(getFlag('cluster', 'devnet'));
const AIRDROP = !!getFlag('airdrop', false);

const RPC = CLUSTER === 'mainnet' ? 'https://api.mainnet-beta.solana.com'
          : CLUSTER === 'testnet' ? 'https://api.testnet.solana.com'
          : 'https://api.devnet.solana.com';

const REG_FILE = 'trading_wallets.json';

function nowStamp() {
  const d=new Date();
  const z=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}${z(d.getMonth()+1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}`;
}

function loadRegistry() {
  try { return JSON.parse(readFileSync(REG_FILE, 'utf8')); } catch { return []; }
}

function saveRegistry(list) {
  writeFileSync(REG_FILE, JSON.stringify(list, null, 2));
}

(async () => {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  const stamp = nowStamp();
  const conn = new Connection(RPC, 'confirmed');

  const reg = loadRegistry();
  const added = [];

  for (let i=0;i<COUNT;i++) {
    const kp = Keypair.generate();
    const pub = kp.publicKey.toBase58();
    const filename = path.join(DIR, `${TAG}-${stamp}-${String(i+1).padStart(2,'0')}.json`);
    writeFileSync(filename, JSON.stringify(Array.from(kp.secretKey)));
    const entry = {
      pubkey: pub,
      path: filename,
      tag: TAG,
      createdAt: new Date().toISOString(),
      cluster: CLUSTER,
      status: 'new'
    };
    reg.push(entry);
    added.push(entry);

    if (AIRDROP && CLUSTER === 'devnet') {
      try {
        const sig = await conn.requestAirdrop(new PublicKey(pub), 1 * LAMPORTS_PER_SOL);
        await conn.confirmTransaction(sig, 'confirmed');
        entry.status = 'funded';
        entry.airdropSig = sig;
      } catch (e) {
        entry.status = 'airdrop_failed';
        entry.airdropError = String(e.message || e);
      }
    }
  }

  saveRegistry(reg);

  console.log(`Created ${added.length} wallets (${CLUSTER}) under ${DIR}/`);
  for (const e of added) {
    console.log(`-> ${e.pubkey}${e.status==='funded' ? ' (funded 1 SOL)' : ''}  [${path.basename(e.path)}]`);
  }
  console.log(`Registry updated: ${REG_FILE}`);
  if (AIRDROP) console.log('Note: devnet airdrop used; may be rate-limited.');
})();
