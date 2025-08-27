#!/usr/bin/env node
const fs = require('fs');
const p = process.env.IDLP;
if (!p) { console.error('IDLP env not set'); process.exit(1); }
const idl = JSON.parse(fs.readFileSync(p,'utf8'));

function findIx(idl, names) {
  for (const n of names) {
    const f = (idl.instructions||[]).find(i => (i.name||'').toLowerCase() === n);
    if (f) return f;
  }
  return null;
}
function walkAccounts(arr, fn) {
  for (const a of arr || []) {
    fn(a);
    if (Array.isArray(a.accounts)) walkAccounts(a.accounts, fn);
  }
}

const ix = findIx(idl, ['execute_route','executeroute','execute']);
if (!ix) { console.error('execute_route not found in IDL'); process.exit(2); }

walkAccounts(ix.accounts, (a) => {
  const name = (a.name||'').toLowerCase();
  if (name === 'global' || name === 'pool' || name === 'vault') a.isMut = true;
  if (name === 'caller') a.isSigner = true;
});

fs.writeFileSync(p, JSON.stringify(idl, null, 2));
console.log('patched', p);
