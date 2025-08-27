#!/usr/bin/env node
const fs = require('fs');
const f  = 'exec-route-provider.cjs';
let s    = fs.readFileSync(f,'utf8').split(/\r?\n/);

// find any shebang lines, keep one
const hasShe = s.findIndex(l => l.startsWith('#!'));
const she    = hasShe >= 0 ? s[hasShe] : '#!/usr/bin/env node';

// drop ALL shebang lines then put one at top
s = s.filter(l => !l.startsWith('#!'));
if (s[0] !== she) s.unshift(she);

fs.writeFileSync(f, s.join('\n'));
console.log('fixed shebang at top for', f);
