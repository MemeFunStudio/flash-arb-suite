const fs=require('fs'); const f='exec-route-provider.cjs';
let s=fs.readFileSync(f,'utf8'); const L=s.split(/\r?\n/);
let i=L.findIndex(l=>l.startsWith('#!/usr/bin/env node'));
if(i>0){ const she=L.splice(i,1)[0]; if(L[0].startsWith('#!')) L.shift(); L.unshift(she); s=L.join('\n'); }
if(!/^#!\/usr\/bin\/env node/.test(s)) s='#!/usr/bin/env node\n'+s.replace(/^#!.*\n/,'');
fs.writeFileSync(f,s); console.log('fixed shebang at top of exec-route-provider.cjs');
