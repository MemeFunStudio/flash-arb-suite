import { readFileSync } from 'fs';
import { Connection, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';

const RPC_URL = 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey('9ckBy54vd9G6FmR63Z4PoLtNq8rbtoYzhVbJGx458Kmn');
const IDL_PATH = 'idl/flash_executor.json';
const GLOBAL_KEYPAIR_PATH = 'global.json'; // we created this signer earlier

function loadGlobalPubkey() {
  const raw = JSON.parse(readFileSync(GLOBAL_KEYPAIR_PATH, 'utf8'));
  const bytes = Uint8Array.from(raw); // should be a 64-byte array
  // First 32 bytes of the secret key are the public key seed; easier: reconstruct a Keypair via anchor's web3 isn't imported here.
  // But we can extract the pubkey using anchor.utils.bytes.pubkey if available; simplest: re-create a Keypair:
  const kp = anchor.web3.Keypair.fromSecretKey(bytes);
  return kp.publicKey;
}

(async () => {
  const idl = JSON.parse(readFileSync(IDL_PATH, 'utf8'));
  const coder = new anchor.BorshCoder(idl);
  const conn = new Connection(RPC_URL, 'confirmed');

  const globalPk = loadGlobalPubkey();
  console.log('Global account:', globalPk.toBase58());

  const info = await conn.getAccountInfo(globalPk);
  if (!info) throw new Error('Global account not found on chain');
  console.log('Owner program:', info.owner.toBase58());

  // Decode as the IDL's GlobalConfig account
  const decoded = coder.accounts.decode('GlobalConfig', info.data);
  // Pretty-print (convert bigints if any)
  const json = JSON.stringify(decoded, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
  console.log(json);
})();
