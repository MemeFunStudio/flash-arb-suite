#!/usr/bin/env node
const fs=require('fs');
let s=fs.readFileSync('exec-route-provider.cjs','utf8');
s=s.replace(/if\s*\(\s*e\.transactionLogs\s*\)\s*console\.error\(\s*e\.transactionLogs\.join\([\s\S]*?\)\s*\)\s*;?/,'if (e.transactionLogs) console.error(e.transactionLogs.join("\\n"));');
fs.writeFileSync('exec-route-provider.cjs',s);
