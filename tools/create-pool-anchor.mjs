import fs from 'fs';
import * as anchor from '@coral-xyz/anchor';
import {PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Connection, Transaction} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID} from '@solana/spl-token';
import BN from 'bn.js';

const kp = anchor.web3.Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(process.env.SOLANA_KEYPAIR,'utf8')))
);

const rpc = process.env.RPC || 'https://api.devnet.solana.com';
const connection = new Connection(rpc,'confirmed');
const wallet = new anchor.Wallet(kp);
const provider = new anchor.AnchorProvider(connection, wallet, {commitment:'confirmed', preflightCommitment:'confirmed'});
anchor.setProvider(provider);

const idl = JSON.parse(fs.readFileSync('idl/flash_executor.json','utf8'));
if (!idl.accounts) idl.accounts = [];
const program = new anchor.Program(idl, new PublicKey(process.env.PROGRAM), provider);

const accounts = {
  global: new PublicKey(process.env.GLOBAL),
  pool: new PublicKey(process.env.POOL),
  vaultAuthority: new PublicKey(process.env.VAULT_AUTHORITY),
  vault: new PublicKey(process.env.VAULT),
  mint: new PublicKey(process.env.MINT),
  tokenProgram: TOKEN_PROGRAM_ID,
  systemProgram: SystemProgram.programId,
  rent: SYSVAR_RENT_PUBKEY,
};

const minBps = new BN(parseInt(process.env.MIN_PROFIT_BPS || '5',10));

const ix = await program.methods.createPool(minBps).accounts(accounts).instruction();

const tx = new Transaction().add(ix);
tx.feePayer = kp.publicKey;
const {blockhash} = await connection.getLatestBlockhash('confirmed');
tx.recentBlockhash = blockhash;
tx.sign(kp);

const sim = await connection.simulateTransaction(tx);
console.log('SIM_OK='+(sim.value.err===null));
console.log('SIM_LOGS='+JSON.stringify(sim.value.logs||[]));
if (sim.value.err){ console.log('SIM_ERR='+JSON.stringify(sim.value.err)); process.exit(1); }

const sig = await provider.sendAndConfirm(tx,[kp]);
console.log('POOL_CREATE_SIG='+sig);
console.log('EXPLORER=https://explorer.solana.com/tx/'+sig+'?cluster=devnet');
