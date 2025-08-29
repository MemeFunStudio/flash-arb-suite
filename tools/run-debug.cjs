const path = require('path');
const {Connection} = require('@solana/web3.js');

const guardPath = path.resolve(__dirname, '../scripts/guard.cjs');
const guard = require(guardPath);

guard.sendSafe = async (connection, tx, signers, env, payerB58) => {
  const sim = await connection.simulateTransaction(tx, {sigVerify:true, replaceRecentBlockhash:true});
  const keys = tx.message.getAccountKeys().staticAccountKeys.map(k => k.toBase58());
  console.log('--- DEBUG SIM ---');
  console.log('ACCOUNTS=', JSON.stringify(keys));
  console.log('LOGS=', JSON.stringify(sim.value && sim.value.logs || []));
  if (sim.value && sim.value.err) {
    console.error('SIM_ERR=', JSON.stringify(sim.value.err));
    process.exit(1);
  }
  console.log('SIM_OK');
  process.exit(0);
};

process.env.DRY_DEBUG = '1';
require(path.resolve(__dirname, '../exec-route-provider.cjs'));
