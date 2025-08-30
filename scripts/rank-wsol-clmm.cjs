const {Connection, PublicKey} = require("@solana/web3.js");

const RPC = process.env.RPC || "https://api.devnet.solana.com";
const RAY_PROG = new PublicKey(process.env.RAY_PROG || "DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH");
const LIMIT = Math.min(parseInt(process.env.LIMIT || "800", 10) || 800, 2000);
const TOKEN_PROG = new PublicKey(process.env.TOKEN_PROGRAM || "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const WSOL = new PublicKey("So11111111111111111111111111111111111111112");

const conn = new Connection(RPC, "confirmed");

function decodeTx(tx) {
  const msg = tx.transaction.message;
  if ("accountKeys" in msg) {
    const keys = msg.accountKeys.map(k => new PublicKey(k.toString()));
    const instr = msg.instructions.map(ix => ({ programIdIndex: ix.programIdIndex, accounts: ix.accounts }));
    return { keys, instr };
  } else {
    const ck = msg.getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses });
    const keys = [...ck.staticAccountKeys, ...(ck.accountKeysFromLookups?.writable || []), ...(ck.accountKeysFromLookups?.readonly || [])];
    const ci = msg.compiledInstructions || msg.instructions || [];
    const instr = ci.map(ix => ({ programIdIndex: ix.programIdIndex, accounts: (ix.accountKeyIndexes || ix.accounts || []) }));
    return { keys, instr };
  }
}

function readU64LE(buf, off) {
  return buf.readBigUInt64LE(off);
}

async function getParsedBatch(pks) {
  const infos = await conn.getMultipleAccountsInfo(pks);
  return infos || [];
}

(async () => {
  const sigs = await conn.getSignaturesForAddress(RAY_PROG, { limit: LIMIT });
  const byPool = new Map();

  for (const s of sigs) {
    const tx = await conn.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
    if (!tx || tx.meta?.err) continue;
    const { keys, instr } = decodeTx(tx);
    const rayIndex = keys.findIndex(k => k.equals(RAY_PROG));
    if (rayIndex < 0) continue;

    for (const ix of instr) {
      if (ix.programIdIndex !== rayIndex) continue;
      const accIdxs = ix.accounts || [];
      const set = Array.from(new Set(accIdxs.map(i => keys[i]).filter(Boolean)));
      if (set.length === 0) continue;

      const infos = await getParsedBatch(set);
      const tokenAccs = [];
      const ownerMap = new Map();
      for (let i = 0; i < set.length; i++) {
        const pk = set[i];
        const info = infos[i];
        if (!info) continue;
        ownerMap.set(pk.toBase58(), info.owner?.toBase58 ? info.owner.toBase58() : String(info.owner || ""));
        if (info.owner && new PublicKey(info.owner).equals(TOKEN_PROG) && info.data && info.data.length >= 165) {
          const mint = new PublicKey(info.data.slice(0, 32));
          const amount = readU64LE(info.data, 64); // raw amount
          tokenAccs.push({ pk, mint, amount });
        }
      }

      const wsolPresent = tokenAccs.some(t => t.mint.equals(WSOL));
      if (!wsolPresent) continue;

      const poolCandidates = set.filter(pk => ownerMap.get(pk.toBase58()) === RAY_PROG.toBase58());
      if (poolCandidates.length === 0) continue;
      const pool = poolCandidates[0].toBase58();

      const sorted = tokenAccs.sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));
      const top2 = sorted.slice(0, 2);
      if (top2.length < 2) continue;

      const score = top2[1].amount; // min of top2
      const rec = byPool.get(pool) || { pool, score: 0n, a: 0n, b: 0n, ma: "", mb: "", sig: s.signature };
      if (score > rec.score) {
        rec.score = score;
        rec.a = top2[0].amount;
        rec.b = top2[1].amount;
        rec.ma = top2[0].mint.toBase58();
        rec.mb = top2[1].mint.toBase58();
        rec.sig = s.signature;
        byPool.set(pool, rec);
      }
    }
  }

  const rows = Array.from(byPool.values()).sort((x, y) => (y.score > x.score ? 1 : y.score < x.score ? -1 : 0)).slice(0, 12);
  if (rows.length === 0) {
    console.log("NO_WSOL_CLMM_FOUND");
    process.exit(0);
  }

  console.log("POOL\tSCORE_MIN_TOP2_RAW\tTOP_A_RAW\tTOP_B_RAW\tMINT_A\tMINT_B\tSAMPLE_TX\tEXPLORER");
  for (const r of rows) {
    const ex = "https://explorer.solana.com/tx/" + r.sig + "?cluster=devnet";
    console.log([r.pool, String(r.score), String(r.a), String(r.b), r.ma, r.mb, r.sig, ex].join("\t"));
  }
})().catch(e => {
  console.error("ERR:", e.message);
  process.exit(1);
});
