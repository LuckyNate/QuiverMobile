// Adaptive AABB volume occupancy of the same closed terrain surface as the renderer.
// The terrain geometry must be a convex, outward-faced triangle shell (current icosphere).
// Future heightmaps feed both renderer and this classifier; non-convex heightmaps
// will require a winding/ray parity classifier instead of the convex half-spaces.
export function createTerrainPartition(positions){
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
 return Object.freeze({planes});
}
// Cache surface planes once; interior nodes are terminal solid and exterior nodes
// terminal empty. Only the boundary is recursively refined.
export function* classifyTerrainVolumesIncremental(source,center,{halfSize=16,maxDepth=5,actors=[],lodDistances=[1.5,3,6,12,24,48]}={}){
 const planes=source?.planes??createTerrainPartition(source).planes;
 // Minimum separation between the terrain node and any moving body's AABB.
 // Individual nodes refine as bodies approach rather than refining whole chunks.
 function desiredDepth(c,h){
  if(!actors.length)return maxDepth;
  let distance=Infinity;
  for(const a of actors){
   const box=a.min&&a.max?a:{min:[a.x??a[0],a.y??a[1],a.z??a[2]],max:[a.x??a[0],a.y??a[1],a.z??a[2]]};
   let squared=0;
   for(let i=0;i<3;i++){
    const min=c[i]-h,max=c[i]+h;
    const delta=Math.max(0,min-box.max[i],box.min[i]-max);
    squared+=delta*delta;
   }
   distance=Math.min(distance,Math.sqrt(squared));
  }
  return Math.max(2,maxDepth-lodDistances.filter(limit=>distance>=limit).length);
 }
 function* walk(c,h,depth,candidates){
  // Also yield work units for empty/outside nodes so the frame budget holds.
  yield null;
  const unresolved=[];
  for(const p of candidates){
   const distance=p.n[0]*c[0]+p.n[1]*c[1]+p.n[2]*c[2]-p.d;
   const extent=h*(Math.abs(p.n[0])+Math.abs(p.n[1])+Math.abs(p.n[2]));
   if(distance-extent>0)return;
   if(distance+extent>0)unresolved.push(p);
  }
  // Fully interior: one coarse solid AABB represents the entire volume.
  if(!unresolved.length){yield {min:c.map(x=>x-h),max:c.map(x=>x+h)};return;}
  if(depth>=desiredDepth(c,h)){
   // At maximum depth the center chooses the boundary cell; this establishes
   // the configured AABB precision rather than falsely filling open space.
   if(unresolved.length&&unresolved.some(p=>p.n[0]*c[0]+p.n[1]*c[1]+p.n[2]*c[2]>p.d))return;
   yield {min:c.map(x=>x-h),max:c.map(x=>x+h)};return;
  }
  const r=h/2;
  for(let bits=0;bits<8;bits++)yield* walk(c.map((x,i)=>x+((bits>>i&1)?r:-r)),r,depth+1,unresolved);
 }
 yield* walk([...center],halfSize,0,planes);
}
export function classifyTerrainVolumes(positions,center,options={}){
 return [...classifyTerrainVolumesIncremental(positions,center,options)].filter(Boolean);
}

// One-time coarse planet partition. Terminal cells are SOLID or EMPTY;
// boundary cells are retained for subsequent local surface refinement.
export function* classifyWorldCoarse(partition,center,halfSize,maxDepth=3){
 const planes=partition.planes;
 const stack=[{center,half:halfSize,depth:0}];
 while(stack.length){
  const node=stack.pop();let outside=false,inside=true;
  for(const p of planes){
   const d=p.n[0]*node.center[0]+p.n[1]*node.center[1]+p.n[2]*node.center[2]-p.d;
   const r=node.half*(Math.abs(p.n[0])+Math.abs(p.n[1])+Math.abs(p.n[2]));
   if(d-r>0){outside=true;break;}
   if(d+r>0)inside=false;
  }
  if(outside||inside||node.depth===maxDepth){
   yield {...node,state:outside?'empty':inside?'solid':'boundary'};
  }else{
   const h=node.half/2;
   for(let i=7;i>=0;i--)stack.push({center:node.center.map((v,k)=>v+((i>>k&1)?h:-h)),half:h,depth:node.depth+1});
  }
 }
}
