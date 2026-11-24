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
 // Capsule clearance against the physical ground, aligned with local radial up.
 // Unlike the old enclosing sphere, this samples the capsule's actual radius
 // and its segment endpoints rather than requiring a 0.9 m spherical gap.
 clearCapsule(p,halfHeight,radius){
  const up=this.up(p);
  const reference=Math.abs(up.z)<.9?{x:0,y:0,z:1}:{x:0,y:1,z:0};
  const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
  let right=cross(up,reference),n=Math.hypot(right.x,right.y,right.z);
  right={x:right.x/n,y:right.y/n,z:right.z/n};
  const forward=cross(up,right);
  // Bottom cap is the limiting ground contact. Upper portions are included
  // for steep terrain, but the test never expands the horizontal radius.
  for(const along of [-halfHeight,0,halfHeight]){
   const center={x:p.x+up.x*along,y:p.y+up.y*along,z:p.z+up.z*along};
   for(const [x,y] of [[0,0],[1,0],[-1,0],[0,1],[0,-1],[.707,.707],[-.707,.707],[.707,-.707],[-.707,-.707]]){
    const radial={x:center.x+radius*(x*right.x+y*forward.x),
     y:center.y+radius*(x*right.y+y*forward.y),
     z:center.z+radius*(x*right.z+y*forward.z)};
    const dist=Math.hypot(radial.x,radial.y,radial.z);
    const surface=this.height?this.height.radius(this.up(radial),this.radius):this.radius;
    if(dist-radius<surface-.025)return false;
   }
  }
  return true;
 }
 // A conservative planet-AABB and radial-band broad phase.
 // Actual boundary placement is governed by the procedural surface,
 // never by occupancy-cell centers.
 mayContainBoundary(box){
  const outer=this.radius*(1+TERRAIN_AMPLITUDE_RATIO);
  const inner=this.radius*(1-TERRAIN_AMPLITUDE_RATIO);
  let nearest2=0,farthest2=0;
  for(let i=0;i<3;i++){
   const nearest=Math.max(0,box.min[i],-box.max[i]);
   nearest2+=nearest*nearest;
   const farthest=Math.max(Math.abs(box.min[i]),Math.abs(box.max[i]));
   farthest2+=farthest*farthest;
  }
  return nearest2<=outer*outer&&farthest2>=inner*inner;
 }
 // Lazy solid octree: interior cube first, then subdivide only the
 // shell where solid terrain and empty space meet.
 query(box,{kinds=null}={}){
  if(kinds&&!kinds.includes('static'))return [];
  const result=[];
  const minRadius=this.radius*(1-TERRAIN_AMPLITUDE_RATIO);
  const maxRadius=this.radius*(1+TERRAIN_AMPLITUDE_RATIO);
  const intersects=(c,h)=>c.every((v,i)=>v+h>=box.min[i]&&v-h<=box.max[i]);
  const visit=(c,h,path)=>{
   if(!intersects(c,h))return;
   let nearest=0,farthest=0;
   for(let axis=0;axis<3;axis++){
    const a=Math.abs(c[axis]);
    nearest+=Math.max(0,a-h)**2;
    farthest+=(a+h)**2;
   }
   if(nearest>maxRadius*maxRadius)return;
   // A whole cube fits in the guaranteed inner core: it is solid,
   // regardless of noise. No more subdivisions are needed.
   const inside=farthest<=minRadius*minRadius;
   if(inside||2*h<=this.minCell){
    if(!inside){
     // A leaf straddling the mathematical surface is classified by
     // its center; the octree acts as the discrete collision world.
     const r=Math.hypot(...c);
     const surface=r>0?(this.height?this.height.radius({
      x:c[0]/r,y:c[1]/r,z:c[2]/r
     },this.radius):this.radius):this.radius;
     if(r>surface) return;
    }
    result.push({id:'solid:'+path,kind:'static',shape:'box',owner:'planet',
     box:{min:c.map(v=>v-h),max:c.map(v=>v+h)}});
    return;
   }
   const childHalf=h/2;
   for(let index=0;index<8;index++){
    const child=c.map((v,i)=>v+((index>>i&1)?childHalf:-childHalf));
    visit(child,childHalf,path+index);
   }
  };
  visit([0,0,0],this.halfSize,'');
  return result;
 }
}
