const {Transaction, TransactionInstruction} = require('@solana/web3.js');
const orig = Transaction.prototype.add;
Transaction.prototype.add = function(...args){
  for(const a of args){
    const ok = a instanceof TransactionInstruction;
    if(!ok){
      const t = (a===undefined)?'undefined':(a===null?'null':(Array.isArray(a)?'array':typeof a));
      const p = (()=>{ try{ return JSON.stringify(a); }catch{ return String(a); } })();
      console.error('TX_ADD_BAD_ARG type='+t+' payload='+p);
    }
  }
  return orig.apply(this, args);
};
