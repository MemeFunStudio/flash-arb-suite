#!/usr/bin/env node
const fs = require('fs');
const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(r => rl.question(q, x => r(x.trim())));
(async () => {
  const envPath = './provider.env';
  const raw = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  const get = k => {
    const m = raw.find(l => l.startsWith(k+'='));
    if (!m) return '';
    return m.split('=')[1].replace(/^['"]|['"]$/g,'');
  };
  const curr = {
    PORT_PROG: get('PORT_PROG'),
    PORT_LENDING_MARKET: get('PORT_LENDING_MARKET'),
    PORT_USDC_RESERVE: get('PORT_USDC_RESERVE'),
    PORT_USDC_LIQ_SUPPLY: get('PORT_USDC_LIQ_SUPPLY'),
  };
  console.log('Current values:');
  console.log(curr);
  const p = await ask('PORT_PROG: ');
  const m = await ask('PORT_LENDING_MARKET: ');
  const r = await ask('PORT_USDC_RESERVE: ');
  const l = await ask('PORT_USDC_LIQ_SUPPLY (token account holding reserve liquidity): ');
  rl.close();
  const set = (k,v) => {
    const i = raw.findIndex(l => l.startsWith(k+'='));
    const line = `${k}="${v}"`;
    if (i >= 0) raw[i] = line; else raw.push(line);
  };
  if (p) set('PORT_PROG', p);
  if (m) set('PORT_LENDING_MARKET', m);
  if (r) set('PORT_USDC_RESERVE', r);
  if (l) set('PORT_USDC_LIQ_SUPPLY', l);
  fs.writeFileSync(envPath, raw.join('\n'));
  console.log('Wrote', envPath);
})();
