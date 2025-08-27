const fs=require('fs');
let s=fs.readFileSync('exec-route-provider.cjs','utf8');

// Replace any existing portKeys block with a strict one
s=s.replace(/const\s+portKeys\s*=\s*\[[\s\S]*?\];/, `
const portKeys = (() => {
  const vals = [
    process.env.PORT_PROG,
    process.env.PORT_LENDING_MARKET,
    process.env.PORT_USDC_RESERVE,
    process.env.PORT_USDC_LIQ_SUPPLY,
  ].map(v => (v||'').trim());
  const isB58 = v => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v);
  const bad = vals.map((v,i)=>({i,v})).filter(x=>!isB58(x.v));
  if (bad.length) {
    console.error('BAD PORT KEYS:', bad);
    throw new Error('Invalid PORT_* key in env');
  }
  return vals;
})();
`);
fs.writeFileSync('exec-route-provider.cjs', s);
console.log('patched portKeys in exec-route-provider.cjs');
