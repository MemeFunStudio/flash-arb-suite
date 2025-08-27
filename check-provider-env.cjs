#!/usr/bin/env node
const req = {
  NONE : [],
  MANGO: ["MANGO_PROG","MANGO_GROUP","MANGO_USDC_BANK","MANGO_ACCOUNT","MANGO_CACHE","MANGO_TOKEN_VAULT","FLASH_LOAN_AMOUNT"],
  PORT : ["PORT_PROG","PORT_LENDING_MARKET","PORT_USDC_RESERVE","PORT_USDC_LIQ_SUPPLY","FLASH_LOAN_AMOUNT"],
};
const sel = (process.env.FL_PROVIDER||"NONE").toUpperCase();
if (!req[sel]) { console.log("Unknown FL_PROVIDER:", sel); process.exit(1); }
const miss = req[sel].filter(k => !process.env[k] || process.env[k]==="");
if (miss.length) { console.log(`[${sel}] missing env:`, miss.join(", ")); process.exit(2); }
console.log(`[${sel}] env looks OK.`);
