import {TerrainHeight} from './engine/terrain-height.js';
import * as THREE from 'three';
export const ROOT_EDGE_METERS=4096;
export const RADIUS=ROOT_EDGE_METERS*Math.sqrt(10+2*Math.sqrt(5))/4;
// Maximum surface distance at which each subdivision level becomes desirable.
export const LOD_MAX_DISTANCE_METERS=[
 Infinity,Infinity,2100,1050,525,262.5,132,66,33,16.5,8.25,4.125,2.0625
];
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
function node(a,b,c,level){
 const center=a.clone().add(b).add(c).normalize();
 const reach=RADIUS*Math.max(center.distanceTo(a),center.distanceTo(b),center.distanceTo(c));
 return {a,b,c,level,center,reach,children:null,split:false};
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
  // Screen-door reveal avoids transparent sorting issues with water.
  this.material.onBeforeCompile=shader=>{
   shader.uniforms.lodReveal={value:1};
   shader.fragmentShader='uniform float lodReveal;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace(
    '#include <dithering_fragment>',
    '#include <dithering_fragment>\nif(lodReveal < 1.0 && fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453) > lodReveal) discard;'
   );
   this.fadeShader=shader;
  };
  scene.add(this.mesh);
  this.leafCount=0;
  this.update(new THREE.Vector3(0,0,RADIUS+1.3),true);
 }
 update(position,force=false){
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
  const normalized=position.clone().normalize();
  const altitude=position.length()-RADIUS;
  let changed=force;
  const leaves=[];
  const visit=n=>{
   const arc=RADIUS*Math.acos(THREE.MathUtils.clamp(n.center.dot(normalized),-1,1));
   // Conservative distance to triangle; prevents abrupt detail loss at edges.
   const distance=Math.hypot(Math.max(0,arc-n.reach),altitude);
   const threshold=LOD_MAX_DISTANCE_METERS[n.level+1];
   const split=n.level<MAX_LOD && distance<(n.split?threshold*HYSTERESIS:threshold);
   if(split){
    if(!n.children){
     const ab=mid(n.a,n.b),bc=mid(n.b,n.c),ca=mid(n.c,n.a),level=n.level+1;
     n.children=[node(n.a,ab,ca,level),node(ab,n.b,bc,level),node(ca,bc,n.c,level),node(ab,bc,ca,level)];
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
  const positions=[],colors=[];
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
  const add=(a,b,c)=>{
   const A=radial(a),B=radial(b),C=radial(c);
   const outward=new THREE.Vector3().subVectors(B,A).cross(new THREE.Vector3().subVectors(C,A)).dot(A)>=0;
   for(const p of (outward?[A,B,C]:[A,C,B])){
    positions.push(p.x,p.y,p.z);
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
   if(boundary.length===3){add(n.a,n.b,n.c);continue;}
   // Fan from a shared-height interior point to the stitched boundary.
   // No skirts or collider changes: neighboring edges now have identical vertices.
   const center=n.a.clone().add(n.b).add(n.c).normalize();
   for(let i=0;i<boundary.length;i++)
    add(center,boundary[i],boundary[(i+1)%boundary.length]);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
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
