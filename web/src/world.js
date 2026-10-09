import {TerrainHeight} from './engine/terrain-height.js';
import * as THREE from 'three';
export const ROOT_EDGE_METERS=8192; // Current experiment, not a fixed engine limit.
export const RADIUS=ROOT_EDGE_METERS*Math.sqrt(10+2*Math.sqrt(5))/4;
// Maximum surface distance at which each subdivision level becomes desirable.
// Keep approximately 1 m finest nominal edges when root size changes.
// Each active LOD band is spaced 20 m from the next for this experiment.
export const MAX_TERRAIN_LOD=Math.round(Math.log2(ROOT_EDGE_METERS));
export const LOD_MAX_DISTANCE_METERS=Array.from(
 {length:MAX_TERRAIN_LOD+1},
 (_,level)=>level<2?Infinity:20*(MAX_TERRAIN_LOD-level+1)
);
const MAX_LOD=LOD_MAX_DISTANCE_METERS.length-1;
const HYSTERESIS=1.2;
const LOD_FADE_SECONDS=.35;
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
function node(a,b,c,level,parent=null){
 const center=a.clone().add(b).add(c).normalize();
 const reach=RADIUS*Math.max(center.distanceTo(a),center.distanceTo(b),center.distanceTo(c));
 return {a,b,c,level,parent,center,reach,children:null,split:false};
}
// Render-only spherical triangle hierarchy; physical surface is independent.
// Retained nodes and split hysteresis avoid rebuilding when walking near a LOD threshold.
export class WorldTerrain {
 constructor(scene,height=new TerrainHeight()){
  this.height=height;
  this.roots=roots.map(([a,b,c])=>node(a,b,c,0));
  this.geometry=new THREE.BufferGeometry();
  this.material=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:1,side:THREE.DoubleSide,flatShading:true});
  this.mesh=new THREE.Mesh(this.geometry,this.material);
  this.mesh.frustumCulled=false;
  this.scene=scene;
  this.ghost=null;
  this.fadeElapsed=LOD_FADE_SECONDS;
  this.fadeShader=null;
  this.ghostShader=null;
  this.morphPlayer=new THREE.Vector3(0,0,RADIUS);
  this.morphUniform=null;
  // Screen-door reveal avoids transparent sorting issues with water.
  this.material.onBeforeCompile=shader=>{
   shader.uniforms.lodReveal={value:1};
   shader.uniforms.morphPlayer={value:this.morphPlayer};
   shader.vertexShader='attribute vec3 morphOrigin;\nattribute float morphRange;\nuniform vec3 morphPlayer;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace(
    '#include <begin_vertex>',
    '#include <begin_vertex>\nfloat morphDistance=length(position-morphPlayer);\nfloat morphFactor=1.0-smoothstep(morphRange*0.55,morphRange,morphDistance);\ntransformed=mix(morphOrigin,position,morphRange>0.0?morphFactor:1.0);'
   );
   shader.fragmentShader='uniform float lodReveal;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace(
    '#include <dithering_fragment>',
    '#include <dithering_fragment>\nif(lodReveal < 1.0 && fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453) > lodReveal) discard;'
   );
   this.fadeShader=shader;
  };
  scene.add(this.mesh);
  this.leafCount=0;
  this.maxDetailLevel=MAX_LOD;
  this.maxDetail=MAX_LOD;
  this.update(new THREE.Vector3(0,0,RADIUS+1.3),true);
 }
 update(position,force=false,maxDetail=MAX_LOD){
  maxDetail=Math.max(2,Math.min(MAX_LOD,Math.floor(maxDetail)));
  if(maxDetail!==this.maxDetail){force=true;this.maxDetail=maxDetail;}
  if(this.ghost){
   const now=performance.now();
   this.fadeElapsed+=Math.min(.05,(now-this.fadeClock)/1000);
   this.fadeClock=now;
   const t=Math.min(1,this.fadeElapsed/LOD_FADE_SECONDS);
   const fade=t*t*(3-2*t);
   if(this.fadeShader)this.fadeShader.uniforms.lodReveal.value=fade;
   if(this.ghostShader)this.ghostShader.uniforms.lodReveal.value=fade;
   if(t>=1)this.finishFade();
  }
  this.morphPlayer.copy(position);
  const normalized=position.clone().normalize();
  const altitude=position.length()-RADIUS;
  let changed=force;
  const leaves=[];
  const visit=n=>{
   const arc=RADIUS*Math.acos(THREE.MathUtils.clamp(n.center.dot(normalized),-1,1));
   // Conservative distance to triangle; prevents abrupt detail loss at edges.
   const distance=Math.hypot(Math.max(0,arc-n.reach),altitude);
   const threshold=LOD_MAX_DISTANCE_METERS[n.level+1];
   const split=n.level<maxDetail && distance<(n.split?threshold*HYSTERESIS:threshold);
   if(split){
    if(!n.children){
     const ab=mid(n.a,n.b),bc=mid(n.b,n.c),ca=mid(n.c,n.a),level=n.level+1;
     n.children=[node(n.a,ab,ca,level,n),node(ab,n.b,bc,level,n),node(ca,bc,n.c,level,n),node(ab,bc,ca,level,n)];
    }
    if(!n.split)changed=true;
    n.split=true;
    for(const child of n.children)visit(child);
   }else{
    if(n.split)changed=true;
    n.split=false;
    leaves.push(n);
   }
  };
  for(const root of this.roots)visit(root);
  if(!changed)return false;
  const positions=[],colors=[],morphOrigins=[],morphRanges=[];
  // Every leaf vertex is shared through its direction, independent of LOD.
  // A coarse edge is split wherever a finer neighbor owns its midpoint.
  const key=v=>[v.x,v.y,v.z].map(x=>Math.round(x*1e9)).join(',');
  const vertices=new Set();
  for(const n of leaves)for(const v of [n.a,n.b,n.c])vertices.add(key(v));
  const edgePoints=(a,b,depth=0)=>{
   if(depth>=MAX_LOD)return [a];
   const midpoint=mid(a,b);
   if(!vertices.has(key(midpoint)))return [a];
   return [...edgePoints(a,midpoint,depth+1),...edgePoints(midpoint,b,depth+1)];
  };
  const radial=v=>v.clone().multiplyScalar(this.height.radius(v,RADIUS));
  // A new subdivision begins on its parent's actual triangle plane.
  // Its vertices slide toward the finer sampled terrain as the player approaches.
  // Collision heights remain authoritative and are never morphed.
  const coarsePoint=(direction,parent)=>{
   if(!parent)return radial(direction);
   const A=radial(parent.a),B=radial(parent.b),C=radial(parent.c);
   const normal=B.clone().sub(A).cross(C.clone().sub(A));
   const divisor=normal.dot(direction);
   if(Math.abs(divisor)<1e-7)return radial(direction);
   const radius=normal.dot(A)/divisor;
   if(!(radius>0&&Number.isFinite(radius)))return radial(direction);
   return direction.clone().multiplyScalar(radius);
  };
  const add=(a,b,c,leaf)=>{
   const A=radial(a),B=radial(b),C=radial(c);
   const outward=new THREE.Vector3().subVectors(B,A).cross(new THREE.Vector3().subVectors(C,A)).dot(A)>=0;
   for(const p of (outward?[A,B,C]:[A,C,B])){
    positions.push(p.x,p.y,p.z);
    const coarse=coarsePoint(p.clone().normalize(),leaf.parent);
    morphOrigins.push(coarse.x,coarse.y,coarse.z);
    morphRanges.push(leaf.level>=2?LOD_MAX_DISTANCE_METERS[leaf.level]:0);
    const color=terrainColor(p.length()-(RADIUS-1));
    colors.push(color.r,color.g,color.b);
   }
  };
  for(const n of leaves){
   const boundary=[
    ...edgePoints(n.a,n.b),
    ...edgePoints(n.b,n.c),
    ...edgePoints(n.c,n.a)
   ];
   if(boundary.length===3){add(n.a,n.b,n.c,n);continue;}
   // Fan from a shared-height interior point to the stitched boundary.
   // No skirts or collider changes: neighboring edges now have identical vertices.
   const center=n.a.clone().add(n.b).add(n.c).normalize();
   for(let i=0;i<boundary.length;i++)
    add(center,boundary[i],boundary[(i+1)%boundary.length],n);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setAttribute('morphOrigin',new THREE.Float32BufferAttribute(morphOrigins,3));
  geometry.setAttribute('morphRange',new THREE.Float32BufferAttribute(morphRanges,1));
  geometry.computeVertexNormals();
  if(this.ghost)this.finishFade();
  const oldGeometry=this.geometry;
  if(!force&&oldGeometry.getAttribute('position')?.count){
   const oldMaterial=new THREE.MeshStandardMaterial({
    color:0xffffff,vertexColors:true,roughness:1,side:THREE.DoubleSide,
    flatShading:true,depthWrite:true
   });
   // Complementary fade masks: both meshes write opaque depth ahead of water.
   this.ghostShader=null;
   oldMaterial.onBeforeCompile=shader=>{
    shader.uniforms.lodReveal={value:this.fadeElapsed/LOD_FADE_SECONDS};
    shader.fragmentShader='uniform float lodReveal;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace(
     '#include <dithering_fragment>',
     '#include <dithering_fragment>\nif(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453) <= lodReveal) discard;'
    );
    this.ghostShader=shader;
   };
   this.ghost=new THREE.Mesh(oldGeometry,oldMaterial);
   this.ghost.frustumCulled=false;
   this.ghost.renderOrder=-1;
   this.scene.add(this.ghost);
   this.fadeElapsed=0;
   this.fadeClock=performance.now();
   if(this.fadeShader)this.fadeShader.uniforms.lodReveal.value=0;
  }else oldGeometry.dispose();
  this.geometry=geometry;
  this.mesh.geometry=geometry;
  this.leafCount=leaves.length;
  return true;
 }
 finishFade(){
  if(!this.ghost)return;
  this.scene.remove(this.ghost);
  this.ghost.geometry.dispose();
  this.ghost.material.dispose();
  this.ghost=null;
  this.ghostShader=null;
  this.fadeElapsed=LOD_FADE_SECONDS;
  if(this.fadeShader)this.fadeShader.uniforms.lodReveal.value=1;
 }
}
