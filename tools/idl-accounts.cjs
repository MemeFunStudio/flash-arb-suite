const fs=require('fs');
const idl=JSON.parse(fs.readFileSync('idl/mango_v4.json','utf8'));
for(const a of (idl.accounts||[])){ console.log(a.name); }
