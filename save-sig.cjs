#!/usr/bin/env node
const fs = require('fs'), os = require('os');
const sig = process.env.SIG;
if (!sig) { console.error('SIG env var not set'); process.exit(1); }
const ts   = new Date().toISOString();
const link = `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

const dir  = os.homedir() + '/.flash-arb';
fs.mkdirSync(dir, { recursive: true });

// append to text log
fs.appendFileSync(dir + '/sent.log', `${ts} ${sig} ${link}\n`);

// append to JSON ledger
const jf = dir + '/sigs.json';
let j = [];
try { j = JSON.parse(fs.readFileSync(jf, 'utf8')); } catch {}
j.push({ ts, sig, link });
fs.writeFileSync(jf, JSON.stringify(j, null, 2));

console.log('saved', sig, '->', dir + '/sent.log and sigs.json');
