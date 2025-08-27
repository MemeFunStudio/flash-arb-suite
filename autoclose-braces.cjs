#!/usr/bin/env node
const fs=require('fs');
const p='exec-route-provider.cjs';
let s=fs.readFileSync(p,'utf8');
let par=0,cur=0,brk=0,qq=null,esc=false;
for(const ch of s){
  if(qq){
    if(esc){ esc=false; continue }
    if(ch==='\\'){ esc=true; continue }
    if((qq==='"'&&ch=== '"')||(qq==="'"&&ch==="'")||(qq==='`'&&ch==='`')) qq=null;
    continue
  }
  if(ch==='"'||ch==="'"||ch==='`'){ qq=ch; continue }
  if(ch==='(') par++;
  else if(ch===')') par=Math.max(0,par-1);
  else if(ch==='{') cur++;
  else if(ch==='}') cur=Math.max(0,cur-1);
  else if(ch==='[') brk++;
  else if(ch===']') brk=Math.max(0,brk-1);
}
s=s.replace(/\s*$/,'')+'\n'+(']'.repeat(brk))+(')'.repeat(par))+('}'.repeat(cur))+'\n';
fs.writeFileSync(p,s);
console.log('autoclosed', {par,cur,brk});
