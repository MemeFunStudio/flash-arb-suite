const fs = require('fs');
const f = 'exec-route-provider.cjs';
let s = fs.readFileSync(f, 'utf8');

const block = `// BEGIN PROVIDER ACCOUNTS
function envPubkey(name){
  const v = (process.env[name] || '').trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)) throw new Error('Invalid or missing env ' + name);
  return v;
}
function getProviderKeys(p){
  if (p === 'PORT') {
    return [
      envPubkey('PORT_PROG'),
      envPubkey('PORT_LENDING_MARKET'),
      envPubkey('PORT_USDC_RESERVE'),
      envPubkey('PORT_USDC_LIQ_SUPPLY'),
    ];
  }
  if (p === 'MANGO') {
    return [
      envPubkey('MANGO_PROG'),
      envPubkey('MANGO_GROUP'),
      envPubkey('MANGO_USDC_BANK'),
      envPubkey('MANGO_ACCOUNT'),
      envPubkey('MANGO_CACHE'),
      envPubkey('MANGO_TOKEN_VAULT'),
    ];
  }
  return [];
}
const provider = (process.env.FL_PROVIDER || 'NONE').toUpperCase();
const providerKeys = getProviderKeys(provider);
// END PROVIDER ACCOUNTS`;

s = s.replace(/\/\/ BEGIN PROVIDER ACCOUNTS[\s\S]*?\/\/ END PROVIDER ACCOUNTS/, block);
fs.writeFileSync(f, s);
console.log('patched provider accounts block in ' + f);
