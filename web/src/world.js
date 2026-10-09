import * as THREE from 'three';
export const ROOT_EDGE_METERS=128;
export const RADIUS=ROOT_EDGE_METERS*Math.sqrt(10+2*Math.sqrt(5))/4;
export const LOD_MAX_DISTANCE_METERS=[
 Infinity,Infinity,200,100,50,24,12,6,3
];
const base=new THREE.IcosahedronGeometry(1,0);
const pos=base.getAttribute('position');
const roots=[];
for(let i=0;i<pos.count;i+=3)roots.push([new THREE.Vector3().fromBufferAttribute(pos,i).normalize(),new THREE.Vector3().fromBufferAttribute(pos,i+1).normalize(),new THREE.Vector3().fromBufferAttribute(pos,i+2).normalize()]);
base.dispose();
const mid=(a,b)=>a.clone().add(b).normalize();
export class WorldTerrain {
 constructor(scene) {
  this.geometry=new THREE.BufferGeometry();
  this.material=new THREE.MeshStandardMaterial({color:0x3e5760,roughness:1,side:THREE.FrontSide,flatShading:true});
  this.mesh=new THREE.Mesh(this.geometry,this.material);scene.add(this.mesh);
  this.edges=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xff00ff,transparent:true,opacity:.65,depthTest:true,depthWrite:false}));
  this.edges.visible=true;scene.add(this.edges);
  this.maxDepth=8;this.leafCount=0;
 }
 rebuild(player,camera) {
  const leaves=[],maxLeaves=14000;
  const visit=(a,b,c,level)=>{
   if(leaves.length>=maxLeaves)return;
   const center=a.clone().add(b).add(c).normalize().multiplyScalar(RADIUS);
   const near=Math.max(0,center.distanceTo(player)-RADIUS*2.0/Math.pow(2,level));
   const edge=a.distanceTo(b)*RADIUS;
   // Separate level distances from visibility: distance gates how fine a patch can be.
   const allowed=level<this.maxDepth && near<LOD_MAX_DISTANCE_METERS[Math.min(level+1,18)] && edge>1;
   if(!allowed){leaves.push([a,b,c]);return;}
   const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);
   visit(a,ab,ca,level+1);visit(ab,b,bc,level+1);visit(ca,bc,c,level+1);visit(ab,bc,ca,level+1);
  };
  for(const [a,b,c] of roots)visit(a,b,c,0);
  const tris=[],wire=[];
  for(const tri of leaves){
   let [a,b,c]=tri.map(p=>p.clone().multiplyScalar(RADIUS));
   // Orient all faces outward, independently of source index order.
   if(new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)).dot(a)<0)[b,c]=[c,b];
   for(const p of [a,b,c])tris.push(p.x,p.y,p.z);
   for(const [p,q] of [[a,b],[b,c],[c,a]])wire.push(p.x,p.y,p.z,q.x,q.y,q.z);
  }
  const geom=new THREE.BufferGeometry();geom.setAttribute('position',new THREE.Float32BufferAttribute(tris,3));geom.computeVertexNormals();
  this.geometry.dispose();this.geometry=geom;this.mesh.geometry=geom;
  const lines=new THREE.BufferGeometry();lines.setAttribute('position',new THREE.Float32BufferAttribute(wire,3));
  this.edges.geometry.dispose();this.edges.geometry=lines;
  this.leafCount=leaves.length;
 }
}
