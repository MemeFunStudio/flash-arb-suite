"use strict";
const { PublicKey } = require("@solana/web3.js");
const b58=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const toPk=v=>typeof v==="string"&&b58.test(v.trim())?new PublicKey(v.trim()):null;
function buildPortFlashLoanIxs(cfg, borrower){
  const need=["PROGRAM_ID","LENDING_MARKET","USDC_RESERVE","USDC_LIQ_SUPPLY"];
  for(const k of need){ if(!toPk(cfg[k])) return {pre:[],post:[]}; }
  return { pre:[], post:[] };
}
module.exports={ buildPortFlashLoanIxs };
