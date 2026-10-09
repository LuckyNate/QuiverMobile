// Static solidity from the convex, outward-facing icosphere triangles.
// Occupancy is classified in volume, not by vertical raycasts or a test platform.
import { StaticAabbOctree } from './solidity.js';

export function buildWorldSolidity(geometry, frame, {extent=16, depth=6}={}) {
 const positions=geometry.getAttribute('position');
 if(!positions?.count)throw new Error('World triangle geometry missing');
 const planes=[];
 for(let i=0;i<positions.count;i+=3){
  const a=[positions.getX(i),positions.getY(i),positions.getZ(i)];
  const b=[positions.getX(i+1),positions.getY(i+1),positions.getZ(i+1)];
  const c=[positions.getX(i+2),positions.getY(i+2),positions.getZ(i+2)];
  const ab=b.map((v,j)=>v-a[j]),ac=c.map((v,j)=>v-a[j]);
  let n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
  const len=Math.hypot(...n);if(len<1e-8)continue;
  n=n.map(v=>v/len);
  if(n.reduce((s,v,j)=>s+v*a[j],0)<0)n=n.map(v=>-v);
  // Convert the world-space half-space into the fixed planet-local simulation basis.
  const local=[n[0]*frame.east.x+n[1]*frame.east.y+n[2]*frame.east.z,
               n[0]*frame.up.x+n[1]*frame.up.y+n[2]*frame.up.z,
               n[0]*frame.north.x+n[1]*frame.north.y+n[2]*frame.north.z];
  const offset=n.reduce((s,v,j)=>s+v*a[j],0)-n[0]*frame.origin.x-n[1]*frame.origin.y-n[2]*frame.origin.z;
  planes.push({n:local,d:offset});
 }
 // The visible world is a convex triangulated icosphere. An AABB is solid
 // only if all its points lie behind every triangle's outward plane.
 const rootCenter=[0,-extent/2,0],rootHalf=extent;
 const active=planes.filter(({n,d})=>{
  const max=n[0]*rootCenter[0]+n[1]*rootCenter[1]+n[2]*rootCenter[2]-d+rootHalf*(Math.abs(n[0])+Math.abs(n[1])+Math.abs(n[2]));
  return max>-1e-7;
 });
 const tree=new StaticAabbOctree(rootCenter,rootHalf,depth);
 let count=0;
 function visit(center,h,level){
  let entirelySolid=true;
  for(const {n,d} of active){
   const dist=n[0]*center[0]+n[1]*center[1]+n[2]*center[2]-d;
   const reach=h*(Math.abs(n[0])+Math.abs(n[1])+Math.abs(n[2]));
   if(dist-reach>0)return; // This whole box is outside at least one world face.
   if(dist+reach>0)entirelySolid=false;
  }
  if(entirelySolid){
   const box={min:center.map(v=>v-h),max:center.map(v=>v+h)};
   tree.insert(box,'solid-'+(count++));return;
  }
  if(level===depth)return; // Conservative: don't fill cells straddling air.
  const child=h/2;
  for(let i=0;i<8;i++)visit(center.map((v,k)=>v+((i>>k&1)?child:-child)),child,level+1);
 }
 visit(rootCenter,rootHalf,0);
 // Fully occupied octree regions are collapsed by recursive classification.
 // Adjacent rectangular leaves may be further merged without changing occupancy.
 tree.compact();
 return tree;
}
