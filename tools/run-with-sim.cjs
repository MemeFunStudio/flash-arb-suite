const path=require('path');
const guard=require(path.resolve(__dirname,'../scripts/guard.cjs'));
const orig=guard.sendSafe;
guard.sendSafe=async function(conn,tx,signers,env,sender){
  const sim=await conn.simulateTransaction(tx,{sigVerify:true,replaceRecentBlockhash:true});
  const logs=(sim&&sim.value&&sim.value.logs)?sim.value.logs:[];
  console.log('SIM_LOGS='+JSON.stringify(logs));
  if(sim&&sim.value&&sim.value.err){throw new Error('SIM_FAILED');}
  return await orig.call(this,conn,tx,signers,env,sender);
};
require(path.resolve(__dirname,'../exec-route-provider.cjs'));
