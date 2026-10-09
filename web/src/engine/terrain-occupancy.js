// Adaptive AABB volume occupancy of the same closed terrain surface as the renderer.
// The terrain geometry must be a convex, outward-faced triangle shell (current icosphere).
// Future heightmaps feed both renderer and this classifier; non-convex heightmaps
// will require a winding/ray parity classifier instead of the convex half-spaces.
export function classifyTerrainVolumes(positions,center,{halfSize=16,maxDepth=5}={}){
 if(!positions?.length||positions.length%9)throw new Error('Unindexed terrain triangles required');
 const planes=[];
 for(let i=0;i<positions.length;i+=9){
  const a=[positions[i],positions[i+1],positions[i+2]];
  const u=[positions[i+3]-a[0],positions[i+4]-a[1],positions[i+5]-a[2]];
  const v=[positions[i+6]-a[0],positions[i+7]-a[1],positions[i+8]-a[2]];
  const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  const magnitude=Math.hypot(...normal);if(magnitude<1e-8)continue;
  const n=normal.map(x=>x/magnitude);
  if(n[0]*a[0]+n[1]*a[1]+n[2]*a[2]<0)n.forEach((x,j)=>n[j]=-x);
  planes.push({n,d:n[0]*a[0]+n[1]*a[1]+n[2]*a[2]});
 }
 const occupied=[];
 function walk(c,h,depth,candidates){
  const unresolved=[];
  for(const p of candidates){
   const distance=p.n[0]*c[0]+p.n[1]*c[1]+p.n[2]*c[2]-p.d;
   const extent=h*(Math.abs(p.n[0])+Math.abs(p.n[1])+Math.abs(p.n[2]));
   if(distance-extent>0)return;
   if(distance+extent>0)unresolved.push(p);
  }
  if(!unresolved.length||depth===maxDepth){
   // At maximum depth the center chooses the boundary cell; this establishes
   // the configured AABB precision rather than falsely filling open space.
   if(unresolved.length&&unresolved.some(p=>p.n[0]*c[0]+p.n[1]*c[1]+p.n[2]*c[2]>p.d))return;
   occupied.push({min:c.map(x=>x-h),max:c.map(x=>x+h)});return;
  }
  const r=h/2;
  for(let bits=0;bits<8;bits++)walk(c.map((x,i)=>x+((bits>>i&1)?r:-r)),r,depth+1,unresolved);
 }
 walk([...center],halfSize,0,planes);
 return occupied;
}
