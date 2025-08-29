const {PublicKey, TransactionInstruction} = require("@solana/web3.js");

function ix(programId, keys, data) {
  return new TransactionInstruction({ programId: new PublicKey(programId), keys, data });
}

function pk(x){ return new PublicKey(x) }

module.exports = async function mangoPrePost(env) {
  const group = pk(env.MANGO_GROUP);
  const programId = pk(env.MANGO_PROGRAM_ID);
  const borrower = pk(env.BORROWER_TA);
  const repayer = pk(env.REPAYER_TA);
  const tokenMint = pk(env.MINT);
  const bank = pk(env.MANGO_BANK);
  const vault = pk(env.MANGO_VAULT);
  const amount = BigInt(env.FL_AMOUNT || "1000"); // in smallest units (e.g. 1000 = 0.001 if 3 decimals)

  const pre = [
    ix(programId, [
      {pubkey: group, isSigner: false, isWritable: true},
      {pubkey: bank, isSigner: false, isWritable: true},
      {pubkey: vault, isSigner: false, isWritable: true},
      {pubkey: borrower, isSigner: false, isWritable: true}
    ], Buffer.from([1]))
  ];

  const post = [
    ix(programId, [
      {pubkey: group, isSigner: false, isWritable: true},
      {pubkey: bank, isSigner: false, isWritable: true},
      {pubkey: vault, isSigner: false, isWritable: true},
      {pubkey: repayer, isSigner: false, isWritable: true},
      {pubkey: tokenMint, isSigner: false, isWritable: false}
    ], Buffer.from([2]))
  ];

  return { pre, post, meta: { tokenMint: tokenMint.toBase58(), amount: amount.toString() } };
};
