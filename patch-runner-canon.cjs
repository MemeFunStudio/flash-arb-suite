#!/usr/bin/env node
const fs=require('fs');
const f='exec-route-provider.cjs';
let s=fs.readFileSync(f,'utf8');

// 1) stop filtering out base metas (we want duplicates allowed, we'll dedupe later)
s=s.replace(
/const extras = [\s\S]*?\.map\(pk => \(\{ pubkey: pk, isSigner: false, isWritable: false \}\)\);\n\n/s,
`const extras = uniqPubkeys([...namedExtras, ...sweptExtras])
  .map(pk => ({ pubkey: pk, isSigner: false, isWritable: false }));

`
);

// 2) force-include canonicals in remaining
if(!/const forceRem = \[/.test(s)){
  s=s.replace(
    /const remaining = extras\.slice\(0, 200\);/,
    `const forceRem = ["GLOBAL","POOL","VAULT_AUTHORITY","VAULT","CALLER","TOKEN_PROGRAM"]
  .map(k => new PublicKey(reqEnv(k)))
  .map(pk => ({ pubkey: pk, isSigner: false, isWritable: false }));
const remaining = uniqPubkeys([...forceRem, ...extras]).slice(0, 200);`
  );
}

fs.writeFileSync(f,s); console.log('patched exec-route-provider.cjs');
