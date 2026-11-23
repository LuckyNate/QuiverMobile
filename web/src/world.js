import {TerrainHeight} from './engine/terrain-height.js';
import {rootAddress,appendChild} from './engine/d20-address.js';
import {WORLD_SETUP,WORLD_SCALE,BIOME_SETUP,terrainLodAtHorizontalDistance} from './engine/world-config.js';
import {D20_ROOT_CORNERS,containsSphericalTriangle,faceAtDirection} from './engine/biome-map.js';
import * as THREE from 'three';
export const ROOT_EDGE_METERS=WORLD_SETUP.rootEdgeMeters;
export const RADIUS=WORLD_SCALE.radius;
export const MAX_TERRAIN_LOD=WORLD_SCALE.maxTerrainLod;
const MAX_LOD=MAX_TERRAIN_LOD;
// Geomorphing band: next to a one-level-coarser neighbour a chunk's heights
// converge on that neighbour's surface across this many metres, so triangle
// size grows smoothly into the seam (CDLOD). It is the only LOD transition.
const GROUND_BLEND_METERS=4;
// Horizontal distance from the local-up axis, excluding the far hemisphere.
function columnDistance(up,node){
 const dot=THREE.MathUtils.clamp(up.dot(node.center),-1,1);
 return dot<=0?Math.PI*RADIUS:Math.max(0,RADIUS*Math.sqrt(1-dot*dot)-node.reach);
}
// Elevation in meters above sea level (RADIUS - 1). Palette is visual only.
const TERRAIN_PALETTE=[
 [-35,0xc6b88a],[0,0xc6b88a],[5,0xc6b88a],
 [10,0x354b2a],[15,0x71934b],[40,0x71934b],
 [55,0xa5a064],[100,0xa5a064],[125,0x877b65],
 [250,0x877b65],[280,0x9a9b9c]
].map(([elevation,hex])=>({elevation,color:new THREE.Color(hex)}));
function terrainColor(elevation){
 for(let i=1;i<TERRAIN_PALETTE.length;i++){
  const low=TERRAIN_PALETTE[i-1],high=TERRAIN_PALETTE[i];
  if(elevation<=high.elevation){
   const t=THREE.MathUtils.smoothstep(elevation,low.elevation,high.elevation);
   return low.color.clone().lerp(high.color,t);
  }
 }
 return TERRAIN_PALETTE[TERRAIN_PALETTE.length-1].color.clone();
}


const roots=D20_ROOT_CORNERS;
const mid=(a,b)=>a.clone().add(b).normalize();
function node(a,b,c,level,parent=null,address=null){
 const center=a.clone().add(b).add(c).normalize();
 const reach=RADIUS*Math.max(center.distanceTo(a),center.distanceTo(b),center.distanceTo(c));
 return {a,b,c,level,parent,address,center,reach,children:null};
}
function children(n){
 if(!n.children){
  const ab=mid(n.a,n.b),bc=mid(n.b,n.c),ca=mid(n.c,n.a),l=n.level+1;
  n.children=[node(n.a,ab,ca,l,n,appendChild(n.address,0)),
   node(ab,n.b,bc,l,n,appendChild(n.address,1)),
   node(ca,bc,n.c,l,n,appendChild(n.address,2)),
   node(ab,bc,ca,l,n,appendChild(n.address,3))];
 }
 return n.children;
}
// Canonical great-circle key for finding edges shared across D20 faces and LODs.
function edgePlane(a,b){
 const normal=new THREE.Vector3().crossVectors(a,b).normalize();
 if(normal.x< -1e-10||(Math.abs(normal.x)<=1e-10&&(normal.y< -1e-10||(Math.abs(normal.y)<=1e-10&&normal.z<0))))normal.negate();
 return {normal,key:[normal.x,normal.y,normal.z].map(x=>Math.round(x*1e8)).join(',')};
}
function onArc(p,a,b){
 const span=a.angleTo(b),u=a.angleTo(p),v=p.angleTo(b);
 return u<=span+1e-8&&v<=span+1e-8&&Math.abs(u+v-span)<1e-8;
}
function edgeSamples(a,b,levels){
 let points=[a,b];
 for(let level=0;level<levels;level++){
  const split=[points[0]];
  for(let i=1;i<points.length;i++)split.push(mid(points[i-1],points[i]),points[i]);
  points=split;
 }
 return points;
}
// Selected leaf boundaries are grouped by great circle. Only the coarser
// side receives the intermediate vertices of touching finer leaf edges.
function boundarySeams(selected){
 const groups=new Map(),edgesByNode=new Map();
 for(const entry of selected){
  const n=entry.node,vs=[n.a,n.b,n.c],edges=[];
  for(let i=0;i<3;i++){
   const a=vs[i],b=vs[(i+1)%3],opposite=vs[(i+2)%3],plane=edgePlane(a,b);
   const edge={a,b,detail:entry.level,node:n,side:Math.sign(plane.normal.dot(opposite)),points:null,morph:false};
   if(!groups.has(plane.key))groups.set(plane.key,[]);
   groups.get(plane.key).push(edge);edges.push({edge,key:plane.key});
  }
  edgesByNode.set(n,edges);
 }
 // Geomorphic LOD. Where a chunk's neighbour is exactly one level coarser over
 // the same arc, the finer chunk morphs its own heights onto that neighbour's
 // surface (geometry), so no second mesh is drawn and no vertices are stitched
 // into the coarse side. That is how CDLOD closes an LOD seam.
 const sameArc=(x,y)=>(x.a.distanceTo(y.a)<1e-9&&x.b.distanceTo(y.b)<1e-9)||
  (x.a.distanceTo(y.b)<1e-9&&x.b.distanceTo(y.a)<1e-9);
 const overlaps=(x,y)=>onArc(y.a,x.a,x.b)||onArc(y.b,x.a,x.b)||
  onArc(x.a,y.a,y.b)||onArc(x.b,y.a,y.b);
 for(const [,list] of groups){
  for(const edge of list){
   for(const other of list){
    if(other===edge||other.side===edge.side||!overlaps(edge,other))continue;
    if(edge.detail-other.detail!==1||!sameArc(edge,other))continue;
    // Needs at least one interior level to morph across.
    edge.morph=edge.detail>edge.node.level;
   }
  }
 }
 const seams=new Map();
 for(const entry of selected){
  const edges=edgesByNode.get(entry.node),result=[],signature=[],morph=[];
  for(const {edge,key} of edges){
   const points=[];
   for(const other of groups.get(key)){
    if(other===edge||other.side===edge.side||other.detail<=edge.detail)continue;
    // Avoid subdividing a nonoverlapping collinear edge.
    if(!overlaps(edge,other))continue;
    // A finer neighbour that morphs onto our surface closes the seam itself.
    if(other.morph)continue;
    if(!other.points)other.points=edgeSamples(other.a,other.b,other.detail-other.node.level);
    for(const p of other.points){
     if(p.distanceTo(edge.a)<1e-9||p.distanceTo(edge.b)<1e-9)continue;
     if(onArc(p,edge.a,edge.b))points.push(p);
    }
   }
   points.sort((a,b)=>edge.a.angleTo(a)-edge.a.angleTo(b));
   const unique=points.filter((p,i)=>!i||p.distanceTo(points[i-1])>1e-9);
   result.push(unique);
   morph.push(Boolean(edge.morph));
   // The mesh variant depends on actual boundary vertices, not neighbor IDs.
   signature.push(unique.map(p=>[p.x,p.y,p.z].map(v=>v.toPrecision(14)).join(',')).join(';')+(edge.morph?'^':''));
  }
  seams.set(entry.node,{edges:result,morph,signature:signature.join('|')});
 }
 return seams;
}
function contains(n,p){return containsSphericalTriangle(p,[n.a,n.b,n.c]);}
// Render chunks ARE the persistent D20 hierarchy nodes. Geometry is cached
// per node/detail/edge variant; Box3D and collision caches are separate.
// Terrain geometry is the only ground surface: no near-field overlay mesh and
// no dithered cross-fade, because geomorphic LOD already makes the transitions
// continuous.
export class WorldTerrain {
 constructor(scene,height=new TerrainHeight(),startPosition=new THREE.Vector3(0,0,RADIUS+1.3),zFar=5000){
  this.height=height;
  this.roots=roots.map(([a,b,c],face)=>node(a,b,c,0,null,rootAddress(face)));
  this.material=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:1,side:THREE.DoubleSide,flatShading:true});
  this.scene=scene;
  this.cache=new Map();
  this.displayed=new Set();
  this.staging=false;
  this.pending=[];
  this.requested=new Set();
  this.renderEnabled=true;
  this.maxDetail=MAX_LOD;
  this.zFar=zFar;
  this.anchorAddress=null;
  this.lodCenter=null;
  this.leafCount=0;
  // The collision surface is physics-owned; the renderer samples the same
  // height provider, so it needs no copy of it.
  this.collisionSurface=null;
  // A guaranteed complete low-detail planet remains visible while new
  // generations of render geometry are prepared offscreen.
  for(const n of this.roots){
   const key=String(n.address)+':0:fallback';
   const mesh=new THREE.Mesh(this.geometry(n,0),this.material);
   mesh.frustumCulled=true;
   this.scene.add(mesh);
   this.cache.set(key,{key,mesh,fallback:true});
   this.displayed.add(key);
  }
  this.update(startPosition,true);
  // Ensure the player and immediate neighborhood have real node meshes before play.
  this.loadNear(startPosition,64);
 }
 // A stable ~32 m triangular address prevents meter-by-meter LOD reassignment.
 // All outer rings are measured radially from this chunk's center.
 anchor(position){
  const p=position.clone().normalize();
  let n=this.roots.find(root=>contains(root,p));
  if(!n)n=this.roots.reduce((best,item)=>item.center.dot(p)>best.center.dot(p)?item:best);
  const anchorLevel=Math.max(0,MAX_LOD-5);
  while(n.level<anchorLevel){
   const options=children(n);
   n=options.find(child=>contains(child,p))||
    options.reduce((best,item)=>item.center.dot(p)>best.center.dot(p)?item:best);
  }
  return n;
 }
 // Render a chunk at a chosen discrete detail. Sampling uses the same seeded
 // height provider as the physical terrain. Where the neighbour across an edge
 // is exactly one level coarser, this chunk geomorphs onto that neighbour's
 // surface across GROUND_BLEND_METERS, so facet size grows smoothly into the
 // seam (CDLOD); every other boundary keeps the exactly matching stitches.
 geometry(n,detail,seams=[[],[],[]],morph=[false,false,false]){
  const positions=[],colors=[];
  const groundColor=BIOME_SETUP[Number(n.address.slice(1,3))].groundColor;
  const biomeTint=groundColor===null?null:new THREE.Color(groundColor);
  const nodes=[n.a,n.b,n.c];
  const radiusAt=v=>this.height.radius(v,RADIUS);
  // Coarse targets are positions, not radii: the coarse mesh is made of flat
  // chords between its vertices, so the morph has to land on those chords bit
  // for bit or a sub-millimetre mismatch opens a hairline crack at the seam.
  const pointAt=v=>v.clone().multiplyScalar(radiusAt(v));
  const morphEdges=[];
  if(detail-1>n.level)for(let side=0;side<3;side++)if(morph[side])morphEdges.push(
   new THREE.Vector3().crossVectors(nodes[side],nodes[(side+1)%3]).normalize());
  // Edges stitched to a finer neighbour must keep their exact heights, or the
  // shared boundary vertices would separate.
  const stitched=[];
  for(let side=0;side<3;side++)if(seams[side].length)stitched.push(side);
  const morphAt=u=>{
   if(!morphEdges.length)return 0;
   for(const side of stitched)if(onArc(u,nodes[side],nodes[(side+1)%3]))return 0;
   let t=0;
   for(const normal of morphEdges)t=Math.max(t,1-RADIUS*Math.abs(normal.dot(u))/GROUND_BLEND_METERS);
   return t>0?Math.min(1,t):0;
  };
  const sample=(v,coarse)=>{
   const fine=v.clone().multiplyScalar(radiusAt(v));
   const t=coarse?morphAt(v):0;
   const p=t>0?fine.lerp(coarse,t):fine;
   const color=biomeTint||terrainColor(p.length()-(RADIUS+WORLD_SETUP.seaLevelOffsetMeters));
   return {p,color};
  };
  const addTriangle=(a,b,c,ca=null,cb=null,cc=null)=>{
   const A=sample(a,ca),B=sample(b,cb),C=sample(c,cc);
   const outward=new THREE.Vector3().subVectors(B.p,A.p).cross(new THREE.Vector3().subVectors(C.p,A.p)).dot(A.p)>0;
   const verts=outward?[A,B,C]:[A,C,B];
   for(const v of verts){positions.push(v.p.x,v.p.y,v.p.z);colors.push(v.color.r,v.color.g,v.color.b);}
  };
  // Subdivide only the border triangles that touch fine-owned edges.
  // Perimeter fan triangulation preserves the existing coarse interior.
  const centroid=(x,y,z)=>x.clone().add(y).add(z).multiplyScalar(1/3);
  const addConformingTriangle=(a,b,c,coarse)=>{
   const corners=[a,b,c],coarses=coarse?[coarse.a,coarse.b,coarse.c]:[null,null,null],perimeter=[];
   for(let i=0;i<3;i++){
    const from=corners[i],to=corners[(i+1)%3];
    perimeter.push({p:from,coarse:coarses[i]});
    for(let side=0;side<3;side++){
     const u=nodes[side],v=nodes[(side+1)%3];
     if(!onArc(from,u,v)||!onArc(to,u,v))continue;
     const extras=seams[side].filter(p=>p.distanceTo(from)>1e-9&&p.distanceTo(to)>1e-9&&onArc(p,from,to));
     extras.sort((p,q)=>from.angleTo(p)-from.angleTo(q));
     for(const p of extras)perimeter.push({p,coarse:null});
     break;
    }
   }
   if(perimeter.length===3){addTriangle(a,b,c,coarses[0],coarses[1],coarses[2]);return;}
   const center=a.clone().add(b).add(c).normalize();
   const centerCoarse=coarse?centroid(coarse.a,coarse.b,coarse.c):null;
   for(let i=0;i<perimeter.length;i++){
    const A=perimeter[i],B=perimeter[(i+1)%perimeter.length];
    addTriangle(A.p,B.p,center,A.coarse,B.coarse,centerCoarse);
   }
  };
  // coarse holds the corner positions of the detail-1 grid the morph targets;
  // midpoint positions average them, so deeper vertices stay exactly on that
  // coarser surface and the seam closes without stitching.
  const coarseLevel=detail-1;
  const subdivide=(a,b,c,level,coarse)=>{
   if(level>=detail){addConformingTriangle(a,b,c,coarse);return;}
   const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a),childLevel=level+1;
   let kids=null;
   if(coarse){
    const mab=coarse.a.clone().add(coarse.b).multiplyScalar(.5);
    const mbc=coarse.b.clone().add(coarse.c).multiplyScalar(.5);
    const mca=coarse.c.clone().add(coarse.a).multiplyScalar(.5);
    kids=[{a:coarse.a,b:mab,c:mca},{a:mab,b:coarse.b,c:mbc},
     {a:mca,b:mbc,c:coarse.c},{a:mab,b:mbc,c:mca}];
   }else if(morphEdges.length&&childLevel===coarseLevel){
    kids=[{a:pointAt(a),b:pointAt(ab),c:pointAt(ca)},
     {a:pointAt(ab),b:pointAt(b),c:pointAt(bc)},
     {a:pointAt(ca),b:pointAt(bc),c:pointAt(c)},
     {a:pointAt(ab),b:pointAt(bc),c:pointAt(ca)}];
   }
   subdivide(a,ab,ca,childLevel,kids?kids[0]:null);
   subdivide(ab,b,bc,childLevel,kids?kids[1]:null);
   subdivide(ca,bc,c,childLevel,kids?kids[2]:null);
   subdivide(ab,bc,ca,childLevel,kids?kids[3]:null);
  };
  subdivide(n.a,n.b,n.c,n.level,null);
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.computeVertexNormals();
  return g;
 }
 // One D20 hierarchy: parents replace descendants. Local-up vertical
 // cylinders select detail by horizontal distance, ignoring elevation.
 // The three highest-detail bands also define nearby resource streaming.
 resourceStreamRadius(){
  return Math.min(WORLD_SCALE.resourceStreamMeters,3*WORLD_SETUP.terrainLodBandMeters);
 }
 select(anchor,position){
  const selected=[];
  const origin=position.clone().normalize();
  const chunkLevel=Math.max(0,MAX_LOD-5);
  const visit=n=>{
   // Include the node's footprint when calculating horizontal distance.
   const distance=columnDistance(origin,n);
   const target=terrainLodAtHorizontalDistance(distance);
   if(n.level<Math.min(chunkLevel,target)){
    for(const child of children(n))visit(child);
   }else{
    selected.push({node:n,detail:Math.max(n.level,target)});
   }
  };
  for(const root of this.roots)visit(root);
  return selected;
 }
 // Physics owns the collision surface; terrain rendering samples the same
 // height provider directly, so there is nothing to mirror here.
 setCollisionSurface(surface){
  this.collisionSurface=surface;
 }
 updateCollisionSurface(){
  if(!this.collisionSurface)return;
 }
 setRenderEnabled(enabled){
  this.renderEnabled=Boolean(enabled);
  for(const entry of this.cache.values())entry.mesh.visible=this.renderEnabled&&this.displayed.has(entry.key);
 }
 // One generation replaces the previous one directly: geomorphic LOD makes the
 // geometry continuous, so there is no stipple or cross-fade stage.
 applyGeneration(){
  for(const key of this.displayed){
   if(this.requested.has(key))continue;
   const entry=this.cache.get(key);
   if(entry)entry.mesh.visible=false;
  }
  for(const key of this.requested){
   const entry=this.cache.get(key);
   if(entry)entry.mesh.visible=this.renderEnabled;
  }
  this.displayed=new Set(this.requested);
  this.staging=false;
 }
 // A chunk address change only alters the target set; mesh work is streamed.
 update(position,force=false,maxDetail=MAX_LOD,zFar=this.zFar){
  const detailCap=Math.max(2,Math.min(MAX_LOD,Math.floor(maxDetail)));
  const anchor=this.anchor(position);
  const address=String(anchor.address);
  const localUp=position.clone().normalize();
  const moved=!this.lodCenter||RADIUS*Math.acos(THREE.MathUtils.clamp(localUp.dot(this.lodCenter),-1,1))>=WORLD_SETUP.terrainLodRefreshMeters;
  const farChanged=zFar!==this.zFar;
  this.zFar=zFar;
  if(force||address!==this.anchorAddress||moved||detailCap!==this.maxDetail||farChanged){
   this.anchorAddress=address;this.maxDetail=detailCap;
   this.lodCenter=localUp;
   const selected=this.select(anchor,position),required=new Set();
   const resolved=selected.map(({node,detail})=>({node,level:Math.max(node.level,Math.min(detail,detailCap))}));
   const seams=boundarySeams(resolved);
   const queue=[];
   for(const {node:n,level} of resolved){
    const seam=seams.get(n);
    const key=String(n.address)+':'+level+':'+seam.signature;
    required.add(key);
    if(!this.cache.has(key))queue.push({key,node:n,level,seams:seam.edges,morph:seam.morph});
   }
   this.requested=required;
   this.staging=true;
   // Prioritize actual spatial distance, not the subdivision level.
   const origin=position.clone().normalize();
   queue.sort((a,b)=>columnDistance(origin,a.node)-columnDistance(origin,b.node));
   this.pending=queue;
   this.leafCount=required.size;
   // Do not expose partial new coverage. The previous complete generation
   // stays visible until every requested mesh has finished building.
  }
  // At most one new mesh per frame. No traversal/rebuild on ordinary movement.
  if(this.pending.length){
   const job=this.pending.shift();
   if(this.requested.has(job.key)&&!this.cache.has(job.key)){
    const geometry=this.geometry(job.node,job.level,job.seams,job.morph);
    const mesh=new THREE.Mesh(geometry,this.material);
    mesh.frustumCulled=true;
    this.scene.add(mesh);
    this.cache.set(job.key,{key:job.key,mesh});
    mesh.visible=false;
   }
  }
  if(this.staging&&[...this.requested].every(key=>this.cache.has(key)))this.applyGeneration();
  // Evict inactive geometry, never evict chunks required by the current view.
  if(this.cache.size>2200){
   for(const [key,entry] of this.cache){
    if(this.cache.size<=1800)break;
    if(this.requested.has(key)||this.displayed.has(key)||entry.fallback)continue;
    this.scene.remove(entry.mesh);entry.mesh.geometry.dispose();
    this.cache.delete(key);
   }
  }
  return this.pending.length>0;
 }
 // Finish the immediately surrounding render patches before exposing gameplay.
 loadNear(position,radius){
  const origin=position.clone().normalize();
  const remaining=[];
  for(const job of this.pending){
   const distance=columnDistance(origin,job.node);
   if(distance>radius){remaining.push(job);continue;}
   if(this.cache.has(job.key))continue;
   const mesh=new THREE.Mesh(this.geometry(job.node,job.level,job.seams,job.morph),this.material);
   mesh.visible=false;
   this.cache.set(job.key,{key:job.key,mesh});
   this.scene.add(mesh);
  }
  this.pending=remaining;
  if(this.staging&&[...this.requested].every(key=>this.cache.has(key)))this.applyGeneration();
 }
}
