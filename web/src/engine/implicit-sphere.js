// Immutable spherical solidity. Occupancy is implicit; no planet-wide AABB objects.
export class ImplicitSphere {
 constructor(radius,{halfSize=128,minCell=.25}={}){
  if(!(radius>0&&radius<=halfSize&&minCell>0))throw new RangeError('Invalid sphere');
  this.radius=radius;this.radiusSquared=radius*radius;
  this.halfSize=halfSize;this.minCell=minCell;
 }
 query(box,{kinds=null}={}){
  if(kinds&&!kinds.includes('static'))return [];
  const result=[],r2=this.radiusSquared;
  const touches=(c,h)=>c.every((v,i)=>v+h>=box.min[i]&&v-h<=box.max[i]);
  const visit=(c,h,level,index)=>{
   if(!touches(c,h))return;
   let nearest=0,farthest=0;
   for(let i=0;i<3;i++){
    const v=Math.abs(c[i]);
    nearest+=Math.max(0,v-h)**2;
    farthest+=(v+h)**2;
   }
   if(nearest>r2)return;
   if(farthest<=r2||2*h<=this.minCell){
    // At the boundary use the same center-occupancy rule as the old builder.
    if(farthest>r2&&c.reduce((s,v)=>s+v*v,0)>r2)return;
    result.push({id:'solid:'+level+':'+index,kind:'static',shape:'box',owner:'planet',
     box:{min:c.map(v=>v-h),max:c.map(v=>v+h)}});
    return;
   }
   const childHalf=h/2;
   for(let bits=0;bits<8;bits++){
    const child=c.map((v,i)=>v+((bits>>i&1)?childHalf:-childHalf));
    visit(child,childHalf,level+1,index*8+bits+1);
   }
  };
  visit([0,0,0],this.halfSize,0,0);
  return result;
 }
}
