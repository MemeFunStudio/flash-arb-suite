#!/usr/bin/env node
const fs=require('fs');
let s=fs.readFileSync('exec-route-provider.cjs','utf8');

// keep only the first shebang
s=s.replace(/\r/g,'');
s=s.replace(/^\s*#!.*node.*\n?/mg,'');
s='#!/usr/bin/env node\n'+s;

// find compose marker
const marker=/^\/\/\s*-{2,}\s*compose\s*&\s*send\s*-{2,}\s*$/m;
const m=marker.exec(s);
const map={'{':'}','(' :')','[':']'};
function closersNeeded(text){
  let st=[];
  for(const ch of text){ if(map[ch]) st.push(ch); else if('}])'.includes(ch)){ if(st.length && map[st.at(-1)]===ch) st.pop(); } }
  let need=''; while(st.length) need+=map[st.pop()];
  return need;
}

if(m){
  const head=s.slice(0,m.index);
  const tail=s.slice(m.index);
  const need=closersNeeded(head);
  s=head+(need?('\n'+need+'\n'):'')+tail;
}

// final pass for whole file
const needAll=closersNeeded(s);
if(needAll) s+=('\n'+needAll+'\n');

fs.writeFileSync('exec-route-provider.cjs',s);
console.log('AUTOFIXED');
