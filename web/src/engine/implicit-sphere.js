import {TERRAIN_AMPLITUDE_RATIO} from './terrain-height.js';
// Immutable spherical solidity. Occupancy is implicit; no planet-wide AABB objects.
export class ImplicitSphere {
 constructor(radius,{halfSize=128,minCell=.25,height=null}={}){
  if(!(radius>0&&radius<=halfSize&&minCell>0))throw new RangeError('Invalid sphere');
  this.radius=radius;this.radiusSquared=radius*radius;
  this.halfSize=halfSize;this.minCell=minCell;this.height=height;
 }
 up(p){
  const length=Math.hypot(p.x,p.y,p.z);
  if(length<1e-9)return {x:0,y:0,z:1};
  return {x:p.x/length,y:p.y/length,z:p.z/length};
 }
 // Solid ground has one mathematical definition for spawn, motion and emergency recovery.
 clearSphere(p,extent){
  const d=Math.hypot(p.x,p.y,p.z);
  if(d<=extent)return false;
  const up=this.up(p);
  const reference=Math.abs(up.z)<.9?{x:0,y:0,z:1}:{x:0,y:1,z:0};
  const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
  let right=cross(up,reference),n=Math.hypot(right.x,right.y,right.z);
  right={x:right.x/n,y:right.y/n,z:right.z/n};
  const forward=cross(up,right);
  for(const [x,y] of [[0,0],[1,0],[-1,0],[0,1],[0,-1],[.707,.707],[-.707,.707],[.707,-.707],[-.707,-.707]]){
   const sample={x:p.x+extent*(x*right.x+y*forward.x),
    y:p.y+extent*(x*right.y+y*forward.y),
    z:p.z+extent*(x*right.z+y*forward.z)};
   const radius=this.height?this.height.radius(this.up(sample),this.radius):this.radius;
   if(d-extent<radius+.02)return false;
  }
  return true;
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
