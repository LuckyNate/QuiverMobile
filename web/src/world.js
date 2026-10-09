import * as THREE from 'three';
export const RADIUS=1024;
export const ROOT_EDGE_METERS=RADIUS*4/Math.sqrt(10+2*Math.sqrt(5));
// Maximum surface distance at which each subdivision level becomes desirable.
export const LOD_MAX_DISTANCE_METERS=[
 Infinity,Infinity,700,350,175,88,44,22,11,5.5,3
];
const MAX_LOD=LOD_MAX_DISTANCE_METERS.length-1;
const HYSTERESIS=1.2;
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
 constructor(scene){
  this.roots=roots.map(([a,b,c])=>node(a,b,c,0));
  this.geometry=new THREE.BufferGeometry();
  this.material=new THREE.MeshStandardMaterial({color:0x3e5760,roughness:1,side:THREE.DoubleSide,flatShading:true});
  this.mesh=new THREE.Mesh(this.geometry,this.material);
  this.mesh.frustumCulled=false;
  scene.add(this.mesh);
  this.leafCount=0;
  this.update(new THREE.Vector3(0,0,RADIUS+1.3),true);
 }
 update(position,force=false){
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
  const positions=[];
  const add=(a,b,c)=>{
   const A=a.clone().multiplyScalar(RADIUS),B=b.clone().multiplyScalar(RADIUS),C=c.clone().multiplyScalar(RADIUS);
   const outward=new THREE.Vector3().subVectors(B,A).cross(new THREE.Vector3().subVectors(C,A)).dot(A)>=0;
   const vertices=outward?[A,B,C]:[A,C,B];
   for(const p of vertices)positions.push(p.x,p.y,p.z);
  };
  for(const n of leaves){
   add(n.a,n.b,n.c);
   // Visual-only skirts cover T-junctions between adjacent subdivision levels.
   // Depth scales with the local chord sagitta. No geometry reaches Box3D.
   for(const [a,b] of [[n.a,n.b],[n.b,n.c],[n.c,n.a]]){
    const edge=RADIUS*a.distanceTo(b);
    const drop=Math.max(.06,edge*edge/(8*RADIUS)+.06);
    const lowA=a.clone().multiplyScalar(RADIUS-drop),lowB=b.clone().multiplyScalar(RADIUS-drop);
    const highA=a.clone().multiplyScalar(RADIUS),highB=b.clone().multiplyScalar(RADIUS);
    // Double-sided material on skirts to close seams regardless of orientation.
    for(const p of [highA,highB,lowB,highA,lowB,lowA])positions.push(p.x,p.y,p.z);
   }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.computeVertexNormals();
  this.geometry.dispose();
  this.geometry=geometry;
  this.mesh.geometry=geometry;
  this.leafCount=leaves.length;
  return true;
 }
}
