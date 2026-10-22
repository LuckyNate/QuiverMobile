import {TerrainHeight} from './engine/terrain-height.js';
import {rootAddress,appendChild} from './engine/d20-address.js';
import {WORLD_SETUP,WORLD_SCALE,BIOME_SETUP,terrainLodAtHorizontalDistance} from './engine/world-config.js';
import {D20_ROOT_CORNERS,containsSphericalTriangle,faceAtDirection} from './engine/biome-map.js';
import * as THREE from 'three';
export const ROOT_EDGE_METERS=WORLD_SETUP.rootEdgeMeters;
export const RADIUS=WORLD_SCALE.radius;
export const MAX_TERRAIN_LOD=WORLD_SCALE.maxTerrainLod;
const MAX_LOD=MAX_TERRAIN_LOD;
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
   const edge={a,b,detail:entry.level,node:n,side:Math.sign(plane.normal.dot(opposite)),points:null};
   if(!groups.has(plane.key))groups.set(plane.key,[]);
   groups.get(plane.key).push(edge);edges.push({edge,key:plane.key});
  }
  edgesByNode.set(n,edges);
 }
 const seams=new Map();
 for(const entry of selected){
  const edges=edgesByNode.get(entry.node),result=[],signature=[];
  for(const {edge,key} of edges){
   const points=[];
   for(const other of groups.get(key)){
    if(other===edge||other.side===edge.side||other.detail<=edge.detail)continue;
    // Avoid subdividing a nonoverlapping collinear edge.
    if(!onArc(other.a,edge.a,edge.b)&&!onArc(other.b,edge.a,edge.b)&&
       !onArc(edge.a,other.a,other.b)&&!onArc(edge.b,other.a,other.b))continue;
    if(!other.points)other.points=edgeSamples(other.a,other.b,other.detail-other.node.level);
    for(const p of other.points){
     if(p.distanceTo(edge.a)<1e-9||p.distanceTo(edge.b)<1e-9)continue;
     if(onArc(p,edge.a,edge.b))points.push(p);
    }
   }
   points.sort((a,b)=>edge.a.angleTo(a)-edge.a.angleTo(b));
   const unique=points.filter((p,i)=>!i||p.distanceTo(points[i-1])>1e-9);
   result.push(unique);
   // The mesh variant depends on actual boundary vertices, not neighbor IDs.
   signature.push(unique.map(p=>[p.x,p.y,p.z].map(v=>v.toPrecision(14)).join(',')).join(';'));
  }
  seams.set(entry.node,{edges:result,signature:signature.join('|')});
 }
 return seams;
}
function contains(n,p){return containsSphericalTriangle(p,[n.a,n.b,n.c]);}
// Render chunks ARE the persistent D20 hierarchy nodes. Geometry is cached
// per node/detail/edge variant; Box3D and collision caches are separate.
export class WorldTerrain {
 constructor(scene,height=new TerrainHeight(),startPosition=new THREE.Vector3(0,0,RADIUS+1.3),zFar=5000){
  this.height=height;
  this.roots=roots.map(([a,b,c],face)=>node(a,b,c,0,null,rootAddress(face)));
  this.material=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:1,side:THREE.DoubleSide,flatShading:true});
  // The collision hull's exact top faces own the near-ground pixels.
  // Keep D20 for far LOD only; never draw a second surface under the player.
  this.collisionGroundCenter={value:startPosition.clone()};
  this.collisionGroundRadius={value:7};
  this.material.onBeforeCompile=shader=>{
   shader.uniforms.collisionGroundCenter=this.collisionGroundCenter;
   shader.uniforms.collisionGroundRadius=this.collisionGroundRadius;
   shader.vertexShader=shader.vertexShader.replace('#include <common>',
    '#include <common>\nvarying vec3 vGroundWorldPosition;');
   shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',
    '#include <worldpos_vertex>\nvGroundWorldPosition=(modelMatrix*vec4(transformed,1.0)).xyz;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',
    '#include <common>\nvarying vec3 vGroundWorldPosition;\nuniform vec3 collisionGroundCenter;\nuniform float collisionGroundRadius;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',
    '#include <clipping_planes_fragment>\nif(distance(vGroundWorldPosition,collisionGroundCenter)<collisionGroundRadius)discard;');
  };
  this.scene=scene;
  // Nearby visible geometry comes directly from the same surface patches as
  // the Box3D hulls. Both near and distant representations are owned here.
  this.collisionSurface=null;
  this.nearSurfaceSignature='';
  this.nearSurfaceMesh=new THREE.Mesh(new THREE.BufferGeometry(),
   new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,side:THREE.DoubleSide,roughness:1,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));
  this.nearSurfaceMesh.frustumCulled=false;
  this.scene.add(this.nearSurfaceMesh);
  this.cache=new Map();
  this.active=new Set();
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
 // height provider as the physical terrain, without GPU morphs or fade ghosts.
 geometry(n,detail,seams=[[],[],[]]){
  const positions=[],colors=[];
  const groundColor=BIOME_SETUP[Number(n.address.slice(1,3))].groundColor;
  const biomeTint=groundColor===null?null:new THREE.Color(groundColor);
  const sample=v=>{
   const r=this.height.radius(v,RADIUS),p=v.clone().multiplyScalar(r);
   const color=biomeTint||terrainColor(r-(RADIUS+WORLD_SETUP.seaLevelOffsetMeters));
   return {p,color};
  };
  const addTriangle=(a,b,c)=>{
   const A=sample(a),B=sample(b),C=sample(c);
   const outward=new THREE.Vector3().subVectors(B.p,A.p).cross(new THREE.Vector3().subVectors(C.p,A.p)).dot(A.p)>0;
   const verts=outward?[A,B,C]:[A,C,B];
   for(const v of verts){positions.push(v.p.x,v.p.y,v.p.z);colors.push(v.color.r,v.color.g,v.color.b);}
  };
  // Subdivide only the border triangles that touch fine-owned edges.
  // Perimeter fan triangulation preserves the existing coarse interior.
  const addConformingTriangle=(a,b,c)=>{
   const corners=[a,b,c],perimeter=[];
   for(let i=0;i<3;i++){
    const from=corners[i],to=corners[(i+1)%3];
    perimeter.push(from);
    for(let side=0;side<3;side++){
     const ends=[n.a,n.b,n.c],u=ends[side],v=ends[(side+1)%3];
     if(!onArc(from,u,v)||!onArc(to,u,v))continue;
     const extras=seams[side].filter(p=>p.distanceTo(from)>1e-9&&p.distanceTo(to)>1e-9&&onArc(p,from,to));
     extras.sort((p,q)=>from.angleTo(p)-from.angleTo(q));
     perimeter.push(...extras);
     break;
    }
   }
   if(perimeter.length===3){addTriangle(a,b,c);return;}
   const center=a.clone().add(b).add(c).normalize();
   for(let i=0;i<perimeter.length;i++)addTriangle(perimeter[i],perimeter[(i+1)%perimeter.length],center);
  };
  const subdivide=(a,b,c,level)=>{
   if(level>=detail){addConformingTriangle(a,b,c);return;}
   const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);
   subdivide(a,ab,ca,level+1);
   subdivide(ab,b,bc,level+1);
   subdivide(ca,bc,c,level+1);
   subdivide(ab,bc,ca,level+1);
  };
  subdivide(n.a,n.b,n.c,n.level);
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
 setCollisionSurface(surface){
  this.collisionSurface=surface;
  this.nearSurfaceSignature='';
 }
 updateCollisionSurface(position){
  if(!this.collisionSurface)return;
  const bounds={min:[position.x-10,position.y-10,position.z-10],
   max:[position.x+10,position.y+10,position.z+10]};
  const patches=this.collisionSurface.query(bounds);
  const signature=patches.map(p=>p.id).join('|');
  if(signature===this.nearSurfaceSignature)return;
  this.nearSurfaceSignature=signature;
  const positions=[],colors=[];
  for(const patch of patches){
   const corners=patch.corners;
   for(const i of [0,1,2,0,2,3]){
    const point=corners[i];
    positions.push(...point);
    const length=Math.hypot(...point);
    const biomeId=faceAtDirection(new THREE.Vector3(...point).normalize());
    const groundColor=BIOME_SETUP[biomeId].groundColor;
    const color=groundColor===null?terrainColor(length-(RADIUS+WORLD_SETUP.seaLevelOffsetMeters)):new THREE.Color(groundColor);
    colors.push(color.r,color.g,color.b);
   }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.computeVertexNormals();
  const previous=this.nearSurfaceMesh.geometry;
  this.nearSurfaceMesh.geometry=geometry;
  previous.dispose();
 }
 setRenderEnabled(enabled){
  this.renderEnabled=Boolean(enabled);
  this.nearSurfaceMesh.visible=this.renderEnabled;
  for(const entry of this.cache.values())entry.mesh.visible=this.renderEnabled&&this.displayed.has(entry.key);
 }
 // A chunk address change only alters the target set; mesh work is streamed.
 update(position,force=false,maxDetail=MAX_LOD,zFar=this.zFar){
  this.collisionGroundCenter.value.copy(position);
  this.updateCollisionSurface(position);
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
    if(!this.cache.has(key))queue.push({key,node:n,level,seams:seam.edges});
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
    const geometry=this.geometry(job.node,job.level,job.seams);
    const mesh=new THREE.Mesh(geometry,this.material);
    mesh.frustumCulled=true;
    this.scene.add(mesh);
    this.cache.set(job.key,{key:job.key,mesh});
    mesh.visible=false;
   }
  }
  // One atomic visibility swap after the entire requested generation exists.
  // In-flight changes replace the staging target but never punch holes in it.
  if(this.staging&&[...this.requested].every(key=>this.cache.has(key))){
   for(const key of this.displayed){const old=this.cache.get(key);if(old)old.mesh.visible=false;}
   for(const key of this.requested){this.cache.get(key).mesh.visible=this.renderEnabled;}
   this.displayed=new Set(this.requested);
   this.staging=false;
  }
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
   const mesh=new THREE.Mesh(this.geometry(job.node,job.level,job.seams),this.material);
   mesh.visible=false;
   this.cache.set(job.key,{key:job.key,mesh});
   this.scene.add(mesh);
  }
  this.pending=remaining;
  if(this.staging&&[...this.requested].every(key=>this.cache.has(key))){
   for(const key of this.displayed){const old=this.cache.get(key);if(old)old.mesh.visible=false;}
   for(const key of this.requested)this.cache.get(key).mesh.visible=this.renderEnabled;
   this.displayed=new Set(this.requested);
   this.staging=false;
  }
 }
}
