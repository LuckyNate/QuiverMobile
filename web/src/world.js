import * as THREE from 'three';
export const RADIUS=1024;
export const ROOT_EDGE_METERS=RADIUS*4/Math.sqrt(10+2*Math.sqrt(5));
export const LOD_MAX_DISTANCE_METERS=[
 Infinity,Infinity,200,100,50,24,12,6,3
];
const base=new THREE.IcosahedronGeometry(1,0);
const pos=base.getAttribute('position');
const roots=[];
for(let i=0;i<pos.count;i+=3)roots.push([new THREE.Vector3().fromBufferAttribute(pos,i).normalize(),new THREE.Vector3().fromBufferAttribute(pos,i+1).normalize(),new THREE.Vector3().fromBufferAttribute(pos,i+2).normalize()]);
base.dispose();
const mid=(a,b)=>a.clone().add(b).normalize();
// The visual planet is constructed once; movement cannot change the surface.
export class WorldTerrain {
 constructor(scene) {
  const triangles=[];
  const add=(a,b,c,level)=>{
   if(level===6){
    const vertices=[a.clone().multiplyScalar(RADIUS),b.clone().multiplyScalar(RADIUS),c.clone().multiplyScalar(RADIUS)];
    if(new THREE.Vector3().subVectors(vertices[1],vertices[0]).cross(new THREE.Vector3().subVectors(vertices[2],vertices[0])).dot(vertices[0])<0)
     [vertices[1],vertices[2]]=[vertices[2],vertices[1]];
    for(const p of vertices)triangles.push(p.x,p.y,p.z);
    return;
   }
   const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);
   add(a,ab,ca,level+1);add(ab,b,bc,level+1);add(ca,bc,c,level+1);add(ab,bc,ca,level+1);
  };
  for(const [a,b,c] of roots)add(a,b,c,0);
  this.geometry=new THREE.BufferGeometry();
  this.geometry.setAttribute('position',new THREE.Float32BufferAttribute(triangles,3));
  this.geometry.computeVertexNormals();
  this.material=new THREE.MeshStandardMaterial({color:0x3e5760,roughness:1,side:THREE.FrontSide,flatShading:true});
  this.mesh=new THREE.Mesh(this.geometry,this.material);scene.add(this.mesh);
  this.leafCount=triangles.length/9;
 }
}
