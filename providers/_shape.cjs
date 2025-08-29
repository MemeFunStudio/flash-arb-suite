module.exports=function ensureProviderShape(x,n){
  if(!x||!Array.isArray(x.pre)||!Array.isArray(x.post)) throw new Error('BAD_PROVIDER_SHAPE_'+n);
  const ok=i=>i&&i.keys&&i.programId&&i.data;
  if(!x.pre.every(ok)||!x.post.every(ok)) throw new Error('BAD_PROVIDER_Ix_'+n);
  return x;
};
