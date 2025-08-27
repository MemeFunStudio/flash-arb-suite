#!/usr/bin/env node
const fs = require('fs'), os = require('os');
const env = fs.readFileSync(os.homedir()+'/.flash-arb/devnet.env','utf8')
  .split(/\r?\n/)
  .filter(l => /^export\s+[A-Z0-9_]+=/.test(l))
  .map(l => {
    const [,k,vraw] = l.match(/^export\s+([A-Z0-9_]+)=(.*)$/);
    const v = vraw.replace(/^['"]|['"]$/g,'');
    const link = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)
      ? `https://explorer.solana.com/address/${v}?cluster=devnet` : null;
    return { key:k, value:v, explorer:link };
  });

fs.writeFileSync('state/devnet.snapshot.json', JSON.stringify({ snapshot_at:new Date().toISOString(), items: env }, null, 2));
console.log('wrote state/devnet.env and state/devnet.snapshot.json');
