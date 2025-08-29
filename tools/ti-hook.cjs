const web3 = require('@solana/web3.js');
const {PublicKey} = web3;

const _TI = web3.TransactionInstruction;
web3.TransactionInstruction = function(cfg){
  try{
    const pid = cfg && cfg.programId ? new PublicKey(cfg.programId).toBase58() : null;
    const keys = (cfg.keys||[]).map(k=>k.pubkey.toBase58());
    console.log('TI_PROG='+pid);
    console.log('TI_KEYS='+JSON.stringify(keys));
  }catch(e){}
  return new _TI(cfg);
};

const _send = web3.Connection.prototype.sendTransaction;
web3.Connection.prototype.sendTransaction = async function(tx,opts={}){
  try{
    const sim = await this.simulateTransaction(tx,{sigVerify:true,replaceRecentBlockhash:true});
    console.log('SIM_LOGS='+(sim.value && sim.value.logs ? JSON.stringify(sim.value.logs) : '[]'));
    if(sim.value && sim.value.err){ throw new Error('SIM_ERR'); }
  }catch(e){}
  return _send.call(this,tx,opts);
};
