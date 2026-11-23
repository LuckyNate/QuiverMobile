import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {withinSceneryRange} from './scenery-visibility.js';

// Meadows boars are scenery: one goofy cylinder pig per seeded spawn, no
// behaviour beyond standing on the ground at a deterministic angle and size.
function seeded(id,salt){
 let h=2166136261;
 for(const c of String(id)+salt)h=Math.imul(h^c.charCodeAt(0),16777619);
 h=Math.imul(h^(h>>>16),2246822507);h^=h>>>13;
 return (h>>>0)/4294967296;
}
function paint(geometry,hex){
 const color=new THREE.Color(hex);
 const count=geometry.getAttribute('position').count;
 const colors=new Float32Array(count*3);
 for(let i=0;i<count;i++){
  colors[i*3]=color.r;colors[i*3+1]=color.g;colors[i*3+2]=color.b;
 }
 geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
 return geometry;
}
// Local frame: +x is the nose, +y is up, the boar is about 1.2 m long and 0.9 m
// tall. Every part is a cylinder, whole thing merged so one instanced mesh draws
// any number of them.
export function boarGeometry(){
 const parts=[];
 const add=(geometry,hex,{x=0,y=0,z=0,rx=0,ry=0,rz=0}={})=>{
  if(rx)geometry.rotateX(rx);
  if(ry)geometry.rotateY(ry);
  if(rz)geometry.rotateZ(rz);
  geometry.translate(x,y,z);
  parts.push(paint(geometry,hex));
 };
 const laying=(top,bottom,length,segments=7)=>new THREE.CylinderGeometry(top,bottom,length,segments,1).rotateZ(Math.PI/2);
 // barrel body, a slightly fatter rump, a big head and a comically fat snout
 add(laying(.27,.25,1),0x8a5a3b,{y:.52});
 add(laying(.25,.2,.2),0x80533a,{x:-.56,y:.52});
 add(laying(.21,.19,.34),0x96684a,{x:.56,y:.56});
 add(laying(.13,.12,.22),0xc98f7c,{x:.82,y:.5});
 add(laying(.13,.13,.05,8),0xe0a894,{x:.93,y:.5});
 // ears and tusks
 add(new THREE.CylinderGeometry(.004,.1,.24,4),0x6b4630,{x:.62,y:.74,z:.14,rx:.34});
 add(new THREE.CylinderGeometry(.004,.1,.24,4),0x6b4630,{x:.62,y:.74,z:-.14,rx:-.34});
 add(new THREE.CylinderGeometry(.008,.026,.18,4),0xf2e6c8,{x:.88,y:.4,z:.1,rz:-.5});
 add(new THREE.CylinderGeometry(.008,.026,.18,4),0xf2e6c8,{x:.88,y:.4,z:-.1,rz:-.5});
 // eyes
 add(laying(.04,.04,.03,6),0x14100e,{x:.72,y:.64,z:.14});
 add(laying(.04,.04,.03,6),0x14100e,{x:.72,y:.64,z:-.14});
 // four stubby legs
 for(const x of [-.32,.32])for(const z of [-.16,.16]){
  add(new THREE.CylinderGeometry(.05,.042,.4,5),0x6f4a33,{x,y:.2,z});
 }
 // curly tail, two short cylinders
 add(new THREE.CylinderGeometry(.02,.03,.14,4),0x6b4630,{x:-.55,y:.62,rz:.9});
 add(new THREE.CylinderGeometry(.012,.02,.12,4),0x6b4630,{x:-.6,y:.7,rz:1.7});
 const merged=mergeGeometries(parts,false);
 for(const part of parts)part.dispose();
 if(!merged)throw new Error('Boar geometry merge failed');
 merged.computeVertexNormals();
 return merged;
}

export class BoarVisual {
 constructor({root,shared,player,playerId}){
  Object.assign(this,{root,shared,player,playerId});
  this.geometry=boarGeometry();
  this.material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true});
  this.items=new Map();
  this.batches=[];
  this.dummy=new THREE.Object3D();
  this.axis=new THREE.Vector3(0,1,0);
  this.upright=new THREE.Quaternion();
  this.spin=new THREE.Quaternion();
 }
 batch(){
  const open=this.batches.find(entry=>entry.entries.length<entry.capacity);
  if(open)return open;
  const capacity=this.batches.length?Math.min(2048,this.batches[this.batches.length-1].capacity*2):32;
  const mesh=new THREE.InstancedMesh(this.geometry,this.material,capacity);
  mesh.count=0;mesh.frustumCulled=false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  this.root.add(mesh);
  const batch={mesh,entries:[],capacity};
  this.batches.push(batch);
  return batch;
 }
 spawn(id,position){
  if(this.items.has(id))return false;
  const batch=this.batch();
  const item={id,position:position.clone(),batch,index:batch.entries.length,
   yaw:seeded(id,'yaw')*Math.PI*2,size:.85+seeded(id,'size')*.3,visible:true};
  batch.entries.push(item);
  batch.mesh.count=batch.entries.length;
  this.transform(item);
  this.items.set(id,item);
  return true;
 }
 transform(item){
  const up=item.position.clone().normalize();
  this.upright.setFromUnitVectors(this.axis,up);
  this.spin.setFromAxisAngle(this.axis,item.yaw);
  this.dummy.quaternion.copy(this.upright).multiply(this.spin);
  this.dummy.position.copy(item.position);
  this.dummy.scale.setScalar(item.visible?item.size:0);
  this.dummy.updateMatrix();
  item.batch.mesh.setMatrixAt(item.index,this.dummy.matrix);
  item.batch.mesh.instanceMatrix.needsUpdate=true;
 }
 unload(id){
  const item=this.items.get(id);
  if(!item)return;
  const batch=item.batch,last=batch.entries.pop();
  if(last!==item){batch.entries[item.index]=last;last.index=item.index;this.transform(last);}
  batch.mesh.count=batch.entries.length;
  this.items.delete(id);
 }
 update(){
  for(const item of this.items.values()){
   const visible=withinSceneryRange(item.position,this.player.position);
   if(item.visible!==visible){item.visible=visible;this.transform(item);}
  }
 }
}
