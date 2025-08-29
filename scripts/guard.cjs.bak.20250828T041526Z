const {PublicKey} = require("@solana/web3.js");

async function getTokenAccountInfo(connection, account) {
  const info = await connection.getAccountInfo(account, "confirmed");
  if (!info) return null;
  return info;
}

function bytesEq(a,b) {
  if (a.length!==b.length) return false;
  for (let i=0;i<a.length;i++){ if (a[i]!==b[i]) return false; }
  return true;
}

async function verifySweepVaultAta(connection, sweepVault, usdcMint, tokenProgram) {
  const ai = await getTokenAccountInfo(connection, sweepVault);
  if (!ai) throw new Error("SWEEP_VAULT_NOT_FOUND");
  if (!ai.owner.equals(tokenProgram)) throw new Error("SWEEP_VAULT_OWNER_NOT_TOKEN_PROGRAM");
  const data = ai.data;
  const mintBytes = data.slice(0,32);
  if (!bytesEq(mintBytes, usdcMint.toBuffer())) throw new Error("SWEEP_VAULT_WRONG_MINT");
  const state = data[64];
  if (state !== 1) throw new Error("SWEEP_VAULT_NOT_INITIALIZED");
  return true;
}

function resolveUsdcMint(cluster) {
  if (cluster === "mainnet-beta") return new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  return new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
}

function requireMainnetArmed(env, cluster) {
  if (cluster === "mainnet-beta") {
    if ((env.MAINNET_LAUNCH || "") !== "YES") throw new Error("MAINNET_LOCK");
  }
}

function assertWhitelisted(payerPubkey, env) {
  const wl = (env.TRADER_WHITELIST || "").split(",").map(s=>s.trim()).filter(Boolean);
  if (wl.length === 0) return true;
  if (!wl.includes(payerPubkey)) throw new Error("SENDER_NOT_WHITELISTED");
  return true;
}

async function ensureBlockhashAndFeePayer(connection, tx, payerPubkey) {
  if (!tx.feePayer) tx.feePayer = new PublicKey(payerPubkey);
  if (!tx.recentBlockhash) {
    const {blockhash} = await connection.getLatestBlockhash("finalized");
    tx.recentBlockhash = blockhash;
  }
}

async function simulateOk(connection, tx) {
  const sim = await connection.simulateTransaction(tx, {sigVerify: true, replaceRecentBlockhash: true});
  if (!sim || sim.value.err) throw new Error("SIMULATION_FAILED");
  return true;
}

async function sendSafe(connection, tx, signers, env, payerPubkey) {
  const cluster = (env.CLUSTER || "devnet");
  requireMainnetArmed(env, cluster);
  assertWhitelisted(payerPubkey, env);
  if (env.SWEEP_VAULT) {
    const tokenProgram = new PublicKey(env.TOKEN_PROGRAM || "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    const usdc = resolveUsdcMint(cluster);
    await verifySweepVaultAta(connection, new PublicKey(env.SWEEP_VAULT), usdc, tokenProgram);
  }
  await ensureBlockhashAndFeePayer(connection, tx, payerPubkey);
  await simulateOk(connection, tx);
  const sig = await connection.sendTransaction(tx, signers, {skipPreflight: false, preflightCommitment: "confirmed"});
  const conf = await connection.confirmTransaction({signature: sig, commitment: "confirmed"});
  if (conf.value && conf.value.err) throw new Error("CONFIRM_ERROR");
  return sig;
}

module.exports = {
  verifySweepVaultAta,
  resolveUsdcMint,
  requireMainnetArmed,
  assertWhitelisted,
  sendSafe
};
