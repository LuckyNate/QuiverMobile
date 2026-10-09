import {TERRAIN_AMPLITUDE_RATIO} from './terrain-height.js';
// Immutable spherical solidity. Occupancy is implicit; no planet-wide AABB objects.
export class ImplicitSphere {
 constructor(radius,{halfSize=128,minCell=.25,height=null}={}){
  if(!(radius>0&&radius<=halfSize&&minCell>0))throw new RangeError('Invalid sphere');
  this.radius=radius;this.radiusSquared=radius*radius;
  this.halfSize=halfSize;this.minCell=minCell;this.height=height;
 }
 query(box,{kinds=null}={}){
  if(kinds&&!kinds.includes('static'))return [];
  const result=[],r2=this.radiusSquared;
  const limit=this.radius*TERRAIN_AMPLITUDE_RATIO;
  const outer=(this.radius+limit)**2,inner=(this.radius-limit)**2;
  const touches=(c,h)=>c.every((v,i)=>v+h>=box.min[i]&&v-h<=box.max[i]);
  const visit=(c,h,level,path)=>{
   if(!touches(c,h))return;
   let nearest=0,farthest=0;
   for(let i=0;i<3;i++){
    const v=Math.abs(c[i]);
    nearest+=Math.max(0,v-h)**2;
    farthest+=(v+h)**2;
   }
   if(nearest>(this.height?outer:r2))return;
   if(farthest<=(this.height?inner:r2)||2*h<=this.minCell){
    // At the boundary use the same center-occupancy rule as the old builder.
    if(farthest>(this.height?inner:r2)){
     const magnitude=Math.hypot(...c);
     const direction={x:c[0]/magnitude,y:c[1]/magnitude,z:c[2]/magnitude};
     if(magnitude>(this.height?this.height.radius(direction,this.radius):this.radius))return;
    }
    result.push({id:'solid:'+path,kind:'static',shape:'box',owner:'planet',
     box:{min:c.map(v=>v-h),max:c.map(v=>v+h)}});
    return;
   }
   const childHalf=h/2;
   for(let bits=0;bits<8;bits++){
    const child=c.map((v,i)=>v+((bits>>i&1)?childHalf:-childHalf));
    visit(child,childHalf,level+1,path+bits);
   }
  };
  visit([0,0,0],this.halfSize,0,'');
  return result;
 }
}
