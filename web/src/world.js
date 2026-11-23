import {TerrainHeight} from './engine/terrain-height.js';
import {rootAddress,appendChild} from './engine/d20-address.js';
import {WORLD_SETUP,WORLD_SCALE,BIOME_SETUP,terrainLodAtHorizontalDistance} from './engine/world-config.js';
import {D20_ROOT_CORNERS,containsSphericalTriangle,faceAtDirection} from './engine/biome-map.js';
import * as THREE from 'three';
export const ROOT_EDGE_METERS=WORLD_SETUP.rootEdgeMeters;
export const RADIUS=WORLD_SCALE.radius;
export const MAX_TERRAIN_LOD=WORLD_SCALE.maxTerrainLod;
const MAX_LOD=MAX_TERRAIN_LOD;
const BAND_METERS=WORLD_SETUP.terrainLodBandMeters;
// A chunk is the chosen detail for one 20 m band. Across the outer half of that
// band it morphs onto its parent's surface, so it is already the parent's shape
// at the moment the selector swaps it for the coarser chunk (CDLOD). There is
// no second mesh, no stipple and no rebuild while morphing: the factor is
// computed per chunk in the vertex shader from the camera.
const MORPH_FRACTION=.5;
// Horizontal distance from the local-up axis, excluding the far hemisphere.
function columnDistance(up,node){
 const dot=THREE.MathUtils.clamp(up.dot(node.center),-1,1);
 return dot<=0?Math.PI*RADIUS:Math.max(0,RADIUS*Math.sqrt(1-dot*dot)-node.reach);
}
// Distance range over which a chunk drawn at this detail morphs onto the parent.
function morphRange(detail){
 const end=(MAX_LOD-detail+1)*BAND_METERS;
 return {start:Math.max(0,end-BAND_METERS*MORPH_FRACTION),end};
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
function contains(n,p){return containsSphericalTriangle(p,[n.a,n.b,n.c]);}
// Terrain geometry is the only ground surface: no near-field overlay mesh and
// no dithered cross-fade. LOD is one continuous scheme (CDLOD): the selector
// picks a detail per 20 m band, and every chunk morphs onto its parent's exact
// surface across the outer half of its band, in the vertex shader. So a chunk
// is never seen refining: it arrives already the shape it replaces.
export class WorldTerrain {
 constructor(scene,height=new TerrainHeight(),startPosition=new THREE.Vector3(0,0,RADIUS+1.3),zFar=5000){
  this.height=height;
  this.roots=roots.map(([a,b,c],face)=>node(a,b,c,0,null,rootAddress(face)));
  this.material=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:1,side:THREE.DoubleSide,flatShading:true});
  const radiusLiteral=RADIUS.toFixed(9);
  this.material.customProgramCacheKey=()=>'terrainCdlod';
  this.material.onBeforeCompile=shader=>{
   shader.vertexShader=shader.vertexShader
    .replace('#include <common>',`#include <common>
attribute vec3 aParent;
attribute vec3 aCenter;
attribute vec3 aBand;
const float CDLOD_RADIUS=${radiusLiteral};`)
    // Morph by the chunk's horizontal band distance, measured exactly as the
    // CPU selector measures it, so the swap happens at full morph.
    .replace('#include <begin_vertex>',`#include <begin_vertex>
vec3 cdlodUp=normalize(cameraPosition);
float cdlodDot=clamp(dot(cdlodUp,aCenter),-1.0,1.0);
float cdlodDistance=cdlodDot<=0.0?3.14159265*CDLOD_RADIUS:max(0.0,CDLOD_RADIUS*sqrt(max(0.0,1.0-cdlodDot*cdlodDot))-aBand.z);
float cdlodMorph=clamp((cdlodDistance-aBand.x)/max(aBand.y-aBand.x,0.001),0.0,1.0);
transformed=mix(position,aParent,cdlodMorph);`);
  };
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
   const key=String(n.address)+'|0';
   const mesh=new THREE.Mesh(this.geometry(n,0),this.material);
   mesh.frustumCulled=true;
   this.scene.add(mesh);
   this.cache.set(key,{key,mesh,detail:0,node:n,fallback:true});
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
 // Build a chunk at one detail. Every vertex also carries where it sits on the
 // parent (detail-1) surface and the band range the shader morphs across, so
 // runtime LOD changes are free of pops and cracks: at the swap distance the
 // fine chunk has converged on the parent's chords, which are exactly the
 // coarser chunk's vertices.
 geometry(n,detail){
  const positions=[],colors=[],parents=[],centers=[],bands=[];
  const groundColor=BIOME_SETUP[Number(n.address.slice(1,3))].groundColor;
  const biomeTint=groundColor===null?null:new THREE.Color(groundColor);
  const radiusAt=v=>this.height.radius(v,RADIUS);
  // Parent targets are positions, not radii: the parent mesh is made of flat
  // chords between its vertices, so the morph has to land on those chords bit
  // for bit or a sub-millimetre mismatch opens a hairline crack at the seam.
  const pointAt=v=>v.clone().multiplyScalar(radiusAt(v));
  const hasParent=detail-1>n.level;
  const range=hasParent?morphRange(detail):{start:1e6,end:1e6+1};
  const push=(p,parent,color)=>{
   positions.push(p.x,p.y,p.z);
   parents.push(parent.x,parent.y,parent.z);
   colors.push(color.r,color.g,color.b);
   centers.push(n.center.x,n.center.y,n.center.z);
   bands.push(range.start,range.end,n.reach);
  };
  const addTriangle=(a,b,c,ca,cb,cc)=>{
   const A=a.clone().multiplyScalar(radiusAt(a)),B=b.clone().multiplyScalar(radiusAt(b)),C=c.clone().multiplyScalar(radiusAt(c));
   const outward=new THREE.Vector3().subVectors(B,A).cross(new THREE.Vector3().subVectors(C,A)).dot(A)>0;
   const verts=outward?[[A,ca],[B,cb],[C,cc]]:[[A,ca],[C,cc],[B,cb]];
   for(const [v,parent] of verts){
    const color=biomeTint||terrainColor(v.length()-(RADIUS+WORLD_SETUP.seaLevelOffsetMeters));
    push(v,parent||v,color);
   }
  };
  // coarse holds the corner positions of the parent (detail-1) grid; midpoints
  // average them, so every finer vertex lands exactly on that coarser surface.
  const coarseLevel=detail-1;
  const subdivide=(a,b,c,level,coarse)=>{
   if(level>=detail){addTriangle(a,b,c,coarse?coarse.a:null,coarse?coarse.b:null,coarse?coarse.c:null);return;}
   const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a),childLevel=level+1;
   let kids=null;
   if(coarse){
    const mab=coarse.a.clone().add(coarse.b).multiplyScalar(.5);
    const mbc=coarse.b.clone().add(coarse.c).multiplyScalar(.5);
    const mca=coarse.c.clone().add(coarse.a).multiplyScalar(.5);
    kids=[{a:coarse.a,b:mab,c:mca},{a:mab,b:coarse.b,c:mbc},
     {a:mca,b:mbc,c:coarse.c},{a:mab,b:mbc,c:mca}];
   }else if(hasParent&&childLevel===coarseLevel){
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
  g.setAttribute('aParent',new THREE.Float32BufferAttribute(parents,3));
  g.setAttribute('aCenter',new THREE.Float32BufferAttribute(centers,3));
  g.setAttribute('aBand',new THREE.Float32BufferAttribute(bands,3));
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
 // One generation replaces the previous one directly. No stipple stage is
 // needed because a chunk is already morphed onto its parent's surface at the
 // distance where the swap happens.
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
   const queue=[];
   for(const {node:n,level} of resolved){
    const key=String(n.address)+'|'+level;
    required.add(key);
    if(!this.cache.has(key))queue.push({key,node:n,level});
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
    const geometry=this.geometry(job.node,job.level);
    const mesh=new THREE.Mesh(geometry,this.material);
    mesh.frustumCulled=true;
    this.scene.add(mesh);
    this.cache.set(job.key,{key:job.key,mesh,detail:job.level,node:job.node});
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
   const mesh=new THREE.Mesh(this.geometry(job.node,job.level),this.material);
   mesh.visible=false;
   this.cache.set(job.key,{key:job.key,mesh,detail:job.level,node:job.node});
   this.scene.add(mesh);
  }
  this.pending=remaining;
  if(this.staging&&[...this.requested].every(key=>this.cache.has(key)))this.applyGeneration();
 }
}
