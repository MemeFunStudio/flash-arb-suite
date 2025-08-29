const path = require('path');
const web3 = require('@solana/web3.js');

const origSend = web3.Connection.prototype.sendTransaction;
web3.Connection.prototype.sendTransaction = async function(tx, opts = {}) {
  const sim = await this.simulateTransaction(tx, { sigVerify: true, replaceRecentBlockhash: true });
  const keys = tx.message.getAccountKeys().staticAccountKeys.map(k => k.toBase58());
  console.log('--- PROXY SIM ---');
  console.log('ACCOUNTS=', JSON.stringify(keys));
  console.log('LOGS=', JSON.stringify(sim.value && sim.value.logs || []));
  if (sim.value && sim.value.err) {
    console.error('SIM_ERR=', JSON.stringify(sim.value.err));
    throw new Error('SIM_ERR');
  }
  console.log('SIM_OK');
  return 'SIMULATED_'+Date.now();
};

process.env.DRY_DEBUG = '1';
require(path.resolve(__dirname, '../exec-route-provider.cjs'));
