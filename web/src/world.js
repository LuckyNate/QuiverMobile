import {TerrainHeight} from './engine/terrain-height.js';
import {rootAddress,appendChild} from './engine/d20-address.js';
import {WORLD_SETUP,WORLD_SCALE,BIOME_SETUP} from './engine/world-config.js';
import {D20_ROOT_CORNERS,containsSphericalTriangle} from './engine/biome-map.js';
import * as THREE from 'three';
export const ROOT_EDGE_METERS=WORLD_SETUP.rootEdgeMeters;
export const RADIUS=WORLD_SCALE.radius;
export const MAX_TERRAIN_LOD=WORLD_SCALE.maxTerrainLod;
const MAX_LOD=MAX_TERRAIN_LOD;
// One resolution, everywhere: this is the whole terrain system. Every chunk is
// meshed at the same density, so two neighbours meet on the shared edge with
// exactly the same vertices - no LOD selection, no morphing, no stitching, no
// skirts, and nothing can ever pop or crack. Distance only decides the order
// chunks are built in and what the frustum drops.
const DETAIL=MAX_LOD;
// Chunk size is a culling/streaming choice only, not a detail choice. Level 1
// is ~128 m across: 80 chunks over the planet at ~16k triangles each.
const CHUNK_LEVEL=1;
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
// Horizontal distance from the local-up axis, used only to order building and
// (via resource streaming) nothing about detail.
function columnDistance(up,n){
 const dot=THREE.MathUtils.clamp(up.dot(n.center),-1,1);
 return dot<=0?Math.PI*RADIUS:Math.max(0,RADIUS*Math.sqrt(1-dot*dot)-n.reach);
}
export class WorldTerrain {
 constructor(scene,height=new TerrainHeight(),startPosition=new THREE.Vector3(0,0,RADIUS+1.3),zFar=5000){
  this.height=height;
  this.roots=roots.map(([a,b,c],face)=>node(a,b,c,0,null,rootAddress(face)));
  this.material=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:1,side:THREE.DoubleSide,flatShading:true});
  this.scene=scene;
  this.cache=new Map();
  this.requested=new Set();
  this.pending=[];
  this.staging=true;
  this.renderEnabled=true;
  this.maxDetail=DETAIL;
  this.zFar=zFar;
  this.lodCenter=null;
  // Every chunk there is. Built once, kept for good: uniform density means a
  // chunk never has to be rebuilt at a different detail.
  this.chunks=[];
  const collect=n=>{if(n.level<CHUNK_LEVEL)for(const child of children(n))collect(child);else this.chunks.push(n);};
  for(const root of this.roots)collect(root);
  for(const n of this.chunks)this.requested.add(String(n.address));
  this.leafCount=this.chunks.length;
  this.pending=this.chunks.map(n=>({key:String(n.address),node:n}));
  // The ground under the player must exist before gameplay starts.
  this.loadNear(startPosition,6);
  this.update(startPosition,true);
 }
 // A full triangular lattice at this chunk's density. Neighbouring chunks
 // evaluate the shared edge from the same two corner directions at the same
 // dyadic fractions, so their boundary vertices are bit-identical.
 geometry(n){
  const segments=1<<Math.max(0,DETAIL-n.level);
  const A=n.a,B=n.b,C=n.c;
  const groundColor=BIOME_SETUP[Number(n.address.slice(1,3))].groundColor;
  const tint=groundColor===null?null:new THREE.Color(groundColor);
  const positions=[],colors=[],indices=[],rowStart=[];
  const seaOffset=RADIUS+WORLD_SETUP.seaLevelOffsetMeters;
  for(let i=0;i<=segments;i++){
   rowStart.push(positions.length/3);
   const u=i/segments;
   const left=A.clone().multiplyScalar(1-u).addScaledVector(B,u).normalize();
   const right=A.clone().multiplyScalar(1-u).addScaledVector(C,u).normalize();
   for(let j=0;j<=i;j++){
    const dir=i?left.clone().multiplyScalar(1-j/i).addScaledVector(right,j/i).normalize():A.clone();
    const p=dir.clone().multiplyScalar(this.height.radius(dir,RADIUS));
    positions.push(p.x,p.y,p.z);
    const color=tint||terrainColor(p.length()-seaOffset);
    colors.push(color.r,color.g,color.b);
   }
  }
  for(let i=0;i<segments;i++){
   const row=rowStart[i],next=rowStart[i+1];
   for(let j=0;j<=i;j++){
    indices.push(row+j,next+j,next+j+1);
    if(j<i)indices.push(row+j,next+j+1,row+j+1);
   }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array(indices),1));
  g.computeVertexNormals();
  return g;
 }
 // Unused by this renderer, kept because physics owns its own collision mesh.
 setCollisionSurface(surface){
  this.collisionSurface=surface;
 }
 updateCollisionSurface(){
  if(!this.collisionSurface)return;
 }
 setRenderEnabled(enabled){
  this.renderEnabled=Boolean(enabled);
  for(const entry of this.cache.values())entry.mesh.visible=this.renderEnabled;
 }
 resourceStreamRadius(){
  return Math.min(WORLD_SCALE.resourceStreamMeters,3*WORLD_SETUP.terrainLodBandMeters);
 }
 build(key,n){
  if(this.cache.has(key))return;
  const mesh=new THREE.Mesh(this.geometry(n),this.material);
  mesh.frustumCulled=true;
  mesh.visible=this.renderEnabled;
  this.scene.add(mesh);
  this.cache.set(key,{key,mesh,node:n});
 }
 // Keep the queue ordered by distance so ground near the player is solid first.
 reorder(position){
  const up=position.clone().normalize();
  this.pending=this.chunks
   .filter(n=>!this.cache.has(String(n.address)))
   .map(n=>({key:String(n.address),node:n}))
   .sort((a,b)=>columnDistance(up,a.node)-columnDistance(up,b.node));
  this.staging=this.pending.length>0;
 }
 update(position,force=false,maxDetail=DETAIL,zFar=this.zFar){
  this.maxDetail=Math.max(2,Math.min(DETAIL,Math.floor(maxDetail)));
  this.zFar=zFar;
  const up=position.clone().normalize();
  const moved=!this.lodCenter||RADIUS*Math.acos(THREE.MathUtils.clamp(up.dot(this.lodCenter),-1,1))>=WORLD_SETUP.terrainLodRefreshMeters;
  if(force||moved||this.staging){
   this.lodCenter=up;
   if(force||moved||!this.pending.length)this.reorder(position);
  }
  // A few chunks per frame: the whole planet exists within a second or two,
  // and nothing is ever replaced afterwards.
  let budget=6;
  while(budget-->0&&this.pending.length){
   const job=this.pending.shift();
   this.build(job.key,job.node);
  }
  this.staging=this.pending.length>0;
  return this.staging;
 }
 // Build the nearest chunks immediately so gameplay starts on solid ground;
 // the rest stream in a few per frame.
 loadNear(position,count){
  const up=position.clone().normalize();
  const near=this.chunks
   .filter(n=>!this.cache.has(String(n.address)))
   .sort((a,b)=>columnDistance(up,a)-columnDistance(up,b))
   .slice(0,count);
  for(const n of near)this.build(String(n.address),n);
  this.pending=this.pending.filter(job=>!this.cache.has(job.key));
  this.staging=this.pending.length>0;
 }
}
