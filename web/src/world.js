import {TerrainHeight} from './engine/terrain-height.js';
import {rootAddress,appendChild} from './engine/d20-address.js';
import * as THREE from 'three';
export const ROOT_EDGE_METERS=8192; // Current experiment, not a fixed engine limit.
export const RADIUS=ROOT_EDGE_METERS*Math.sqrt(10+2*Math.sqrt(5))/4;
export const MAX_TERRAIN_LOD=Math.round(Math.log2(ROOT_EDGE_METERS));
const MAX_LOD=MAX_TERRAIN_LOD;
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


const base=new THREE.IcosahedronGeometry(1,0),pos=base.getAttribute('position');
const roots=[];
for(let i=0;i<pos.count;i+=3)roots.push([
 new THREE.Vector3().fromBufferAttribute(pos,i).normalize(),
 new THREE.Vector3().fromBufferAttribute(pos,i+1).normalize(),
 new THREE.Vector3().fromBufferAttribute(pos,i+2).normalize()
]);
base.dispose();
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
function contains(n,p){
 const vs=[n.a,n.b,n.c];
 let sign=0;
 for(let i=0;i<3;i++){
  const d=new THREE.Vector3().crossVectors(vs[i],vs[(i+1)%3]).dot(p);
  if(Math.abs(d)<1e-10)continue;
  if(sign&&d*sign<0)return false;
  sign=d;
 }
 return true;
}
// Render chunks ARE the persistent D20 hierarchy nodes. Geometry is cached
// per node/detail pair; Box3D and the world-space collision cache are separate.
export class WorldTerrain {
 constructor(scene,height=new TerrainHeight(),startPosition=new THREE.Vector3(0,0,RADIUS+1.3)){
  this.height=height;
  this.roots=roots.map(([a,b,c],face)=>node(a,b,c,0,null,rootAddress(face)));
  this.material=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:1,side:THREE.DoubleSide,flatShading:true});
  this.scene=scene;
  this.cache=new Map();
  this.active=new Set();
  this.pending=[];
  this.requested=new Set();
  this.renderEnabled=true;
  this.maxDetail=MAX_LOD;
  this.anchorAddress=null;
  this.leafCount=0;
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
 geometry(n,detail){
  const positions=[],colors=[];
  const sample=v=>{
   const r=this.height.radius(v,RADIUS),p=v.clone().multiplyScalar(r);
   const color=terrainColor(r-(RADIUS-1));
   return {p,color};
  };
  const addTriangle=(a,b,c)=>{
   const A=sample(a),B=sample(b),C=sample(c);
   const outward=new THREE.Vector3().subVectors(B.p,A.p).cross(new THREE.Vector3().subVectors(C.p,A.p)).dot(A.p)>0;
   const verts=outward?[A,B,C]:[A,C,B];
   for(const v of verts){positions.push(v.p.x,v.p.y,v.p.z);colors.push(v.color.r,v.color.g,v.color.b);}
  };
  const subdivide=(a,b,c,level)=>{
   if(level>=detail){addTriangle(a,b,c);return;}
   const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);
   subdivide(a,ab,ca,level+1);
   subdivide(ab,b,bc,level+1);
   subdivide(ca,bc,c,level+1);
   subdivide(ab,bc,ca,level+1);
  };
  subdivide(n.a,n.b,n.c,n.level);
  // Render-only skirts conceal T junctions across unequal-detail chunk edges.
  // No skirt contributes to collision or modifies sampled surface heights.
  const edge=(a,b)=>{
   const segments=1<<Math.max(0,detail-n.level),depth=12;
   let prev=a;
   for(let i=1;i<=segments;i++){
    const t=i/segments;
    const v=i===segments?b:a.clone().lerp(b,t).normalize();
    const A=sample(prev),B=sample(v);
    const aLow=A.p.clone().addScaledVector(prev,-depth);
    const bLow=B.p.clone().addScaledVector(v,-depth);
    const strip=[[A.p,B.p,aLow],[B.p,bLow,aLow]];
    for(const triple of strip)for(let j=0;j<3;j++){
     const point=triple[j],color=j===0?A.color:B.color;
     positions.push(point.x,point.y,point.z);
     colors.push(color.r,color.g,color.b);
    }
    prev=v;
   }
  };
  edge(n.a,n.b);edge(n.b,n.c);edge(n.c,n.a);
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.computeVertexNormals();
  return g;
 }
 // Distance is tested at EVERY hierarchical node. Distant parents remain
 // coarse chunks; only nearby nodes are subdivided to the render-chunk level.
 // This avoids creating thousands of 32 m chunks across distant biomes.
 select(anchor){
  const selected=[];
  const origin=anchor.center;
  const chunkLevel=Math.max(0,MAX_LOD-5);
  const visit=n=>{
   const arc=RADIUS*Math.acos(THREE.MathUtils.clamp(origin.dot(n.center),-1,1));
   const distance=Math.max(0,arc-n.reach);
   // A parent only splits while its surface intersects the near-detail region.
   // The region contracts with each level and follows the player's chunk.
   const splitRange=Math.max(64,n.reach*1.5);
   if(n.level<chunkLevel&&distance<splitRange){
    for(const child of children(n))visit(child);
    return;
   }
   // Within the 32 m render chunks, sample full 1 m detail. Outside,
   // progressively reduce the tessellation of the persistent D20 nodes.
   const rings=Math.max(0,Math.ceil((distance-48)/48));
   const detail=n.level>=chunkLevel
    ?Math.max(n.level,MAX_LOD-rings)
    :n.level;
   selected.push({node:n,detail});
  };
  for(const root of this.roots)visit(root);
  return selected;
 }
 setRenderEnabled(enabled){
  this.renderEnabled=Boolean(enabled);
  for(const entry of this.cache.values())entry.mesh.visible=this.renderEnabled&&this.requested.has(entry.key);
 }
 // A chunk address change only alters the target set; mesh work is streamed.
 update(position,force=false,maxDetail=MAX_LOD){
  const detailCap=Math.max(2,Math.min(MAX_LOD,Math.floor(maxDetail)));
  const anchor=this.anchor(position);
  const address=String(anchor.address);
  if(force||address!==this.anchorAddress||detailCap!==this.maxDetail){
   this.anchorAddress=address;this.maxDetail=detailCap;
   const selected=this.select(anchor),required=new Set();
   const queue=[];
   for(const {node:n,detail} of selected){
    const level=Math.max(n.level,Math.min(detail,detailCap));
    const key=String(n.address)+':'+level;
    required.add(key);
    if(!this.cache.has(key))queue.push({key,node:n,level});
   }
   this.requested=required;
   // Prioritize actual spatial distance, not the subdivision level.
   const origin=position.clone().normalize();
   queue.sort((a,b)=>a.node.center.angleTo(origin)-b.node.center.angleTo(origin));
   this.pending=queue;
   this.leafCount=required.size;
   // Keep a complete coarse globe until replacement terrain covers each root.
   for(const [key,entry] of this.cache)entry.mesh.visible=this.renderEnabled&&required.has(key);
  }
  // At most one new mesh per frame. No traversal/rebuild on ordinary movement.
  if(this.pending.length){
   const job=this.pending.shift();
   if(this.requested.has(job.key)&&!this.cache.has(job.key)){
    const geometry=this.geometry(job.node,job.level);
    const mesh=new THREE.Mesh(geometry,this.material);
    mesh.frustumCulled=true;
    this.scene.add(mesh);
    this.cache.set(job.key,{key:job.key,mesh});
    mesh.visible=this.renderEnabled;
   }
  }
  // Evict inactive geometry, never evict chunks required by the current view.
  if(this.cache.size>2200){
   for(const [key,entry] of this.cache){
    if(this.cache.size<=1800)break;
    if(this.requested.has(key))continue;
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
   const distance=RADIUS*job.node.center.angleTo(origin)-job.node.reach;
   if(distance>radius){remaining.push(job);continue;}
   if(this.cache.has(job.key))continue;
   const mesh=new THREE.Mesh(this.geometry(job.node,job.level),this.material);
   mesh.visible=this.renderEnabled;
   this.cache.set(job.key,{key:job.key,mesh});
   this.scene.add(mesh);
  }
  this.pending=remaining;
 }
}
