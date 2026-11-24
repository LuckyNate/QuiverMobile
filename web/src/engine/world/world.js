import {TerrainHeight} from './terrain-height.js';
import {rootAddress,appendChild} from './d20-address.js';
import {WORLD_SETUP,WORLD_SCALE,BIOME_SETUP,terrainLodAtHorizontalDistance} from './world-config.js';
import {D20_ROOT_CORNERS,containsSphericalTriangle} from '../biome/biome-map.js';
import * as THREE from 'three';
export const ROOT_EDGE_METERS=WORLD_SETUP.rootEdgeMeters;
export const RADIUS=WORLD_SCALE.radius;
export const MAX_TERRAIN_LOD=WORLD_SCALE.maxTerrainLod;
const MAX_LOD=MAX_TERRAIN_LOD;
const BAND_METERS=WORLD_SETUP.terrainLodBandMeters;
// Every chunk is the same power-of-two piece of a biome face: 256 m face, 128,
// then 64. Fixed-size chunks keep every edge shared with exactly one neighbour
// over its whole length and with the same two corner vertices, so boundaries
// meet by construction and only the tessellation inside a chunk changes with
// distance. Letting far chunks keep coarser pieces is what broke that: their
// edges then had different corners and a different number of vertices, which no
// amount of matching can reconcile.
const CHUNK_LEVEL=Math.max(0,MAX_LOD-6);
// 1 m triangles are the finest level and only for ground near the player. Each
// 20 m band further out drops one level, so the horizon is drawn with big
// triangles and the total stays around twenty thousand instead of a million.
// Where two chunks of different density meet, the finer side pulls its own seam
// vertices onto the coarser neighbour's edge, so the shared stretch is one
// straight line seen from both meshes: no crack, and the coarse side stays a
// plain triangle instead of being retriangulated around its centroid.
const MORPH_FRACTION=.5;
// 1 bends a chunk toward its coarser parent as it nears the next band, hiding
// the swap; 0 swaps hard instead. The bend has to fade to nothing at a chunk's
// own edges: those vertices are shared with a neighbour that is not bending, so
// moving them would fold the surface over itself into a ridge along the seam.
const MORPH_STRENGTH=1;
// Each ground triangle is shaded its own version of the colour beneath it: near
// the player the grid is 1 m, so that reads as a dapple of similar triangles, and
// far away a chunk is a handful of big triangles, each one flat, so the ground
// goes flat with distance on its own.
// .06 is the reach either side; 0 leaves the ground one flat colour.
const TRIANGLE_SHADE=.06;
// Stable multiplier for one triangle, keyed on its centroid: neighbours share
// corners, so keying on a corner would shade several triangles the same.
function shadeOf(key){
 let h=2166136261;
 for(let i=0;i<key.length;i++)h=Math.imul(h^key.charCodeAt(i),16777619);
 return 1+TRIANGLE_SHADE*((h>>>0)/4294967295*2-1);
}
function columnDistance(up,node){
 const dot=THREE.MathUtils.clamp(up.dot(node.center),-1,1);
 return dot<=0?Math.PI*RADIUS:Math.max(0,RADIUS*Math.sqrt(1-dot*dot)-node.reach);
}
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
// Canonical great-circle key, so edges shared across D20 faces compare equal.
function edgePlane(a,b){
 const normal=new THREE.Vector3().crossVectors(a,b).normalize();
 if(normal.x<-1e-10||(Math.abs(normal.x)<=1e-10&&(normal.y<-1e-10||(Math.abs(normal.y)<=1e-10&&normal.z<0))))normal.negate();
 // Coarse key: two chunks that share an edge must land in the same group even
// when their normals differ by floating-point noise. overlaps() rejects any
// genuinely different circle that lands here by accident.
 return {normal,key:[normal.x,normal.y,normal.z].map(x=>Math.round(x*1e6)).join(',')};
}
function directionKey(v){return [v.x,v.y,v.z].map(x=>Math.round(x*1e6)).join(',');}
// Order-independent key for one mesh edge, so a chunk can look up whether the
// coarser neighbour across it actually spans that exact segment.
function pairKey(a,b){
 const ka=directionKey(a),kb=directionKey(b);
 return ka<kb?ka+'|'+kb:kb+'|'+ka;
}
function hashKey(s){
 let h=0;
 for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;
 return (h>>>0).toString(36);
}
// Walk the same bisection the mesh uses, so a coarse edge contributes exactly
// the segments its own subdivision creates. steps must be a power of two.
function arcSegments(a,b,steps){
 let pts=[a,b];
 for(let s=1;s<steps;s*=2){
  const next=[pts[0]];
  for(let i=1;i<pts.length;i++){next.push(mid(pts[i-1],pts[i]),pts[i]);}
  pts=next;
 }
 const out=[];
 for(let i=0;i<pts.length-1;i++)out.push([pts[i],pts[i+1]]);
 return out;
}
function onArc(p,a,b){
 const span=a.angleTo(b),u=a.angleTo(p),v=p.angleTo(b);
 return u<=span+1e-8&&v<=span+1e-8&&Math.abs(u+v-span)<1e-8;
}
function overlaps(x,y){
 return onArc(y.a,x.a,x.b)||onArc(y.b,x.a,x.b)||onArc(x.a,y.a,y.b)||onArc(x.b,y.a,y.b);
}
// For every chunk edge, record the neighbours that carry a coarser mesh along
// the shared stretch. The finer side pulls its seam vertices onto those
// neighbour chords, so only the fine mesh moves and the coarse mesh is built as
// a plain triangle.
function boundarySeams(selected){
 const groups=new Map(),edgesByNode=new Map();
 for(const entry of selected){
  const n=entry.node,vs=[n.a,n.b,n.c],list=[];
  for(let i=0;i<3;i++){
   const plane=edgePlane(vs[i],vs[(i+1)%3]);
   const edge={a:vs[i],b:vs[(i+1)%3],key:plane.key,entry,
    side:Math.sign(plane.normal.dot(vs[(i+2)%3])),
    segments:1<<Math.max(0,entry.level-n.level)};
   if(!groups.has(plane.key))groups.set(plane.key,[]);
   groups.get(plane.key).push(edge);list.push(edge);
  }
  edgesByNode.set(entry,list);
 }
 const seams=new Map();
 for(const entry of selected){
  const edges=edgesByNode.get(entry);
  const coarse=[false,false,false],shared=[false,false,false];
  // Which concrete edges across this side are coarser. A neighbour may cover
  // only part of a side, so the exact segments matter, not just the side.
  const coarsePairs=[new Set(),new Set(),new Set()],signature=[];
  for(let i=0;i<3;i++){
   const edge=edges[i],step=edge.a.angleTo(edge.b)/edge.segments;
   for(const other of groups.get(edge.key)){
    if(other===edge||other.side===edge.side||!overlaps(edge,other))continue;
    if(other.entry.level!==edge.entry.level||other.segments!==edge.segments)shared[i]=true;
    // Step length depends on display detail alone, so a coarser neighbour is
    // always exactly half as dense and its boundary vertices are our parent
    // grid: the split vertices have somewhere to land.
    if(other.a.angleTo(other.b)/other.segments>step*(1+1e-9)){
     coarse[i]=true;
     for(const [x,y] of arcSegments(other.a,other.b,other.segments))coarsePairs[i].add(pairKey(x,y));
    }
   }
   signature.push(shared[i]?'s'+(coarse[i]?
    'c'+hashKey([...coarsePairs[i]].sort().join('|')):''):'');
  }
  seams.set(entry,{coarse,shared,coarsePairs,signature:signature.join('|')});
 }
 return seams;
}
export class WorldTerrain {
 constructor(scene,height=new TerrainHeight(),startPosition=new THREE.Vector3(0,0,RADIUS+1.3),zFar=5000){
  this.height=height;
  this.roots=roots.map(([a,b,c],face)=>node(a,b,c,0,null,rootAddress(face)));
  // The ground keeps the palette's colour; the surface comes from the per-triangle
  // shading below, not from a texture.
  this.material=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:1,side:THREE.DoubleSide,flatShading:true});
  const radiusLiteral=RADIUS.toFixed(9);
  this.material.customProgramCacheKey=()=>'terrainCdlod';
  // Chunk detail and the morph that hides detail swaps must agree on one
  // origin, and it is the player: zooming the camera must not warp the ground.
  this.lodOrigin={value:new THREE.Vector3(0,0,1)};
  // Chunks morph onto their parent's surface as they approach the next band, so
  // the swap to a coarser mesh is already the same shape. The bend fades out at
  // a chunk's own edges, where it would otherwise fold against a neighbour that
  // is not bending.
  this.material.onBeforeCompile=shader=>{
   shader.uniforms.uLodOrigin=this.lodOrigin;
   shader.vertexShader=shader.vertexShader
    .replace('#include <common>',`#include <common>
attribute vec3 aParent;
attribute vec2 aBand;
attribute float aTaper;
uniform vec3 uLodOrigin;
const float CDLOD_RADIUS=${radiusLiteral};`)
    .replace('#include <begin_vertex>',`#include <begin_vertex>
vec3 cdlodUp=normalize(uLodOrigin);
float cdlodDot=clamp(dot(cdlodUp,normalize(position)),-1.0,1.0);
float cdlodDistance=CDLOD_RADIUS*sqrt(max(0.0,1.0-cdlodDot*cdlodDot));
float cdlodMorph=clamp((cdlodDistance-aBand.x)/max(aBand.y-aBand.x,0.001),0.0,1.0)*aTaper;
transformed=mix(position,aParent,cdlodMorph);`);
  };
  this.scene=scene;
  this.cache=new Map();
  this.requested=new Set();
  this.displayed=new Set();
  this.pending=[];
  this.staging=true;
  this.renderEnabled=true;
  this.maxDetail=MAX_LOD;
  this.zFar=zFar;
  this.lodCenter=null;
  this.leafCount=0;
  for(const n of this.roots){
   const key=String(n.address)+'|0|';
   const mesh=new THREE.Mesh(this.geometry(n,0),this.material);
   mesh.frustumCulled=true;
   this.scene.add(mesh);
   this.cache.set(key,{key,mesh,detail:0,node:n});
   this.displayed.add(key);
  }
  this.update(startPosition,true);
  this.loadNear(startPosition,64);
 }
 anchor(position){
  const p=position.clone().normalize();
  let n=this.roots.find(root=>contains(root,p));
  if(!n)n=this.roots.reduce((best,item)=>item.center.dot(p)>best.center.dot(p)?item:best);
  const anchorLevel=CHUNK_LEVEL;
  while(n.level<anchorLevel){
   const options=children(n);
   n=options.find(child=>contains(child,p))||
    options.reduce((best,item)=>item.center.dot(p)>best.center.dot(p)?item:best);
  }
  return n;
 }
 geometry(n,detail,seam=null){
  const positions=[],colors=[],parents=[],bands=[],tapers=[];
  const nodes=[n.a,n.b,n.c];
  const groundColor=BIOME_SETUP[Number(n.address.slice(1,3))].groundColor;
  const tint=groundColor===null?null:new THREE.Color(groundColor);
  const radiusAt=v=>this.height.radius(v,RADIUS);
  const pointAt=v=>v.clone().multiplyScalar(radiusAt(v));
  const coarsePairs=seam?seam.coarsePairs:null;
  const shared=seam?seam.shared:[false,false,false];
  const onSeam=dir=>{
   for(let side=0;side<3;side++)if(shared[side]&&onArc(dir,nodes[side],nodes[(side+1)%3]))return true;
   return false;
  };
  // A vertex created one step above the leaf grid, on a seam shared with a
  // coarser neighbour, sits halfway between the two vertices either side of it
  // instead of on the sphere. Those two are the coarser neighbour's own
  // vertices, so both meshes draw the same straight boundary without the coarse
  // side gaining a vertex.
  const snapped=new Map();
  const snapMidpoint=(mid,from,to)=>{
   if(!coarsePairs)return;
   const pair=pairKey(from,to);
   for(let side=0;side<3;side++){
    // Only a segment a coarser neighbour actually spans may move. Snapping
    // past its coverage would pull the fine mesh off the surface with nothing
    // on the far side to meet it.
    if(!coarsePairs[side].has(pair)||!onArc(mid,nodes[side],nodes[(side+1)%3]))continue;
    snapped.set(directionKey(mid),pointAt(from).add(pointAt(to)).multiplyScalar(.5));
    return;
   }
  };
  const hasParent=detail-1>n.level;
  const range=hasParent&&MORPH_STRENGTH>0?morphRange(detail):{start:1e6,end:1e6+1};
  // How far a vertex is from the chunk's own edges, as a fraction of the ramp
  // width: 0 on an edge, 1 far enough inside that bending cannot disturb it.
  const sidePlanes=[0,1,2].map(side=>edgePlane(nodes[side],nodes[(side+1)%3]).normal);
  const inradius=Math.min(...sidePlanes.map(normal=>Math.abs(n.center.dot(normal))*RADIUS));
  const ramp=Math.max(1e-3,.35*inradius);
  const taperAt=dir=>{
   if(!hasParent||MORPH_STRENGTH<=0)return 0;
   let edge=Infinity;
   for(const normal of sidePlanes)edge=Math.min(edge,Math.abs(dir.dot(normal))*RADIUS);
   return THREE.MathUtils.smoothstep(edge,0,ramp);
  };
  const push=(dir,p,parent,color)=>{
   // Only a split vertex pulled onto the coarser neighbour's boundary moves;
   // every other vertex is the plain normalized midpoint.
   const at=snapped.get(directionKey(dir))||p;
   positions.push(at.x,at.y,at.z);
   // Seam vertices belong to a shared polyline: no morphing, or the neighbour's
   // split edge would be chasing a moving target.
   const target=onSeam(dir)||!parent?at:parent;
   parents.push(target.x,target.y,target.z);
   colors.push(color.r,color.g,color.b);
   bands.push(range.start,range.end);
   tapers.push(taperAt(dir));
  };
  const addTriangle=(a,b,c,ca,cb,cc)=>{
   const A=pointAt(a),B=pointAt(b),C=pointAt(c);
   const outward=new THREE.Vector3().subVectors(B,A).cross(new THREE.Vector3().subVectors(C,A)).dot(A)>0;
   const verts=outward?[[a,A,ca],[b,B,cb],[c,C,cc]]:[[a,A,ca],[c,C,cc],[b,B,cb]];
   // One shade for all three corners, so the triangle reads as one facet.
   const shade=shadeOf(directionKey(a.clone().add(b).add(c).normalize()));
   for(const [dir,p,parent] of verts){
    const color=(tint||terrainColor(p.length()-(RADIUS+WORLD_SETUP.seaLevelOffsetMeters))).clone().multiplyScalar(shade);
    push(dir,p,parent,color);
   }
  };
  // Every leaf is one plain triangle: four congruent children all the way down,
  // with no centroid fan and no inherited neighbour vertices.
  const addLeaf=(a,b,c,coarse)=>addTriangle(a,b,c,
   coarse?coarse.a:null,coarse?coarse.b:null,coarse?coarse.c:null);
  // coarse carries the positions of the parent (detail-1) grid the morph targets.
  const coarseLevel=detail-1;
  const subdivide=(a,b,c,level,coarse)=>{
   if(level>=detail){addLeaf(a,b,c,coarse);return;}
   const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a),childLevel=level+1;
   // The vertices created by this last step are the odd ones from the coarser
   // neighbour's point of view, so they are the ones that move onto its edge.
   if(childLevel===detail){snapMidpoint(ab,a,b);snapMidpoint(bc,b,c);snapMidpoint(ca,c,a);}
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
  g.setAttribute('aBand',new THREE.Float32BufferAttribute(bands,2));
  g.setAttribute('aTaper',new THREE.Float32BufferAttribute(tapers,1));
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.computeVertexNormals();
  return g;
 }
 // Resources keep their seeded position on the analytic surface, not on a terrain
 // mesh, so streaming is not tied to the LOD bands any more: the ring is whatever
 // the world setup asks for, out to the root edge at most.
 resourceStreamRadius(){
  return Math.min(WORLD_SCALE.resourceStreamMeters,WORLD_SETUP.rootEdgeMeters);
 }
 select(anchor,position){
  const selected=[];
  const origin=position.clone().normalize();
  const chunkLevel=CHUNK_LEVEL;
  const visit=n=>{
   const distance=columnDistance(origin,n);
   const target=terrainLodAtHorizontalDistance(distance);
   if(n.level<chunkLevel){
    for(const child of children(n))visit(child);
   }else{
    selected.push({node:n,detail:Math.max(n.level,target)});
   }
  };
  for(const root of this.roots)visit(root);
  // Neighbours may differ by at most one level, so a seam is always a single
  // step and the split only has to reach one density finer.
  for(let pass=0;pass<8;pass++){
   const groups=new Map();
   for(const entry of selected){
    const n=entry.node,vs=[n.a,n.b,n.c];
    for(let i=0;i<3;i++){
     const plane=edgePlane(vs[i],vs[(i+1)%3]),key=plane.key;
     if(!groups.has(key))groups.set(key,[]);
     groups.get(key).push({a:vs[i],b:vs[(i+1)%3],entry,side:Math.sign(plane.normal.dot(vs[(i+2)%3]))});
    }
   }
   const pairs=[];
   for(const list of groups.values())for(let i=0;i<list.length;i++)for(let k=i+1;k<list.length;k++){
    const x=list[i],y=list[k];
    if(x.side===y.side||!overlaps(x,y))continue;
    pairs.push([x.entry,y.entry]);
   }
   let changed=false;
   for(const [x,y] of pairs){
    if(x.detail-y.detail>1){y.detail=Math.min(MAX_LOD,x.detail-1);changed=true;}
    else if(y.detail-x.detail>1){x.detail=Math.min(MAX_LOD,y.detail-1);changed=true;}
   }
   if(!changed)break;
  }
  return selected;
 }
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
 update(position,force=false,maxDetail=MAX_LOD,zFar=this.zFar){
  // The morph origin follows the player continuously; the mesh itself only
  // rebuilds when the band or the anchor chunk actually changes.
  if(this.lodOrigin)this.lodOrigin.value.copy(position).normalize();
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
   for(const entry of resolved){
    const seam=seams.get(entry);
    const key=String(entry.node.address)+'|'+entry.level+'|'+seam.signature;
    required.add(key);
    if(!this.cache.has(key))queue.push({key,node:entry.node,level:entry.level,seam});
   }
   this.requested=required;
   this.staging=true;
   const origin=position.clone().normalize();
   queue.sort((a,b)=>columnDistance(origin,a.node)-columnDistance(origin,b.node));
   this.pending=queue;
   this.leafCount=required.size;
  }
  if(this.pending.length){
   const job=this.pending.shift();
   if(this.requested.has(job.key)&&!this.cache.has(job.key)){
    const mesh=new THREE.Mesh(this.geometry(job.node,job.level,job.seam),this.material);
    mesh.frustumCulled=true;
    this.scene.add(mesh);
    this.cache.set(job.key,{key:job.key,mesh,detail:job.level,node:job.node});
    mesh.visible=false;
   }
  }
  if(this.staging&&[...this.requested].every(key=>this.cache.has(key)))this.applyGeneration();
  if(this.cache.size>2200){
   for(const [key,entry] of this.cache){
    if(this.cache.size<=1800)break;
    if(this.requested.has(key)||this.displayed.has(key))continue;
    this.scene.remove(entry.mesh);entry.mesh.geometry.dispose();
    this.cache.delete(key);
   }
  }
  return this.pending.length>0;
 }
 loadNear(position,radius){
  const origin=position.clone().normalize();
  const remaining=[];
  for(const job of this.pending){
   if(columnDistance(origin,job.node)>radius){remaining.push(job);continue;}
   if(this.cache.has(job.key))continue;
   const mesh=new THREE.Mesh(this.geometry(job.node,job.level,job.seam),this.material);
   mesh.visible=false;
   this.cache.set(job.key,{key:job.key,mesh,detail:job.level,node:job.node});
   this.scene.add(mesh);
  }
  this.pending=remaining;
  if(this.staging&&[...this.requested].every(key=>this.cache.has(key)))this.applyGeneration();
 }
}
