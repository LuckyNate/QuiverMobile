import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {withinSceneryRange} from '../render/scenery-visibility.js';
import {seededUnit} from '../world/seeded-hash.js';

// Meadows boars are scenery: one goofy cylinder pig per seeded spawn, no
// behaviour beyond standing on the ground at a deterministic angle and size.
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
 // Barrel body that tapers into the rump (no plug on the end), a big head and
 // a comically fat snout. laying(top,bottom): top becomes the rump radius.
 add(laying(.23,.28,1),0x8a5a3b,{y:.52});
 add(laying(.21,.19,.34),0x96684a,{x:.56,y:.56});
 add(laying(.13,.12,.22),0xc98f7c,{x:.82,y:.5});
 add(laying(.13,.13,.05,8),0xe0a894,{x:.93,y:.5});
 // ears and tusks
 add(new THREE.CylinderGeometry(.004,.1,.24,4),0x6b4630,{x:.62,y:.74,z:.14,rx:.34});
 add(new THREE.CylinderGeometry(.004,.1,.24,4),0x6b4630,{x:.62,y:.74,z:-.14,rx:-.34});
 // Tusks curve up and forward from the corners of the mouth, either side of
 // the snout, so they clear the jaw instead of hanging under it.
 add(new THREE.CylinderGeometry(.006,.028,.22,4),0xf2e6c8,{x:.85,y:.54,z:.1,rz:-.85});
 add(new THREE.CylinderGeometry(.006,.028,.22,4),0xf2e6c8,{x:.85,y:.54,z:-.1,rz:-.85});
 // eyes
 add(laying(.04,.04,.03,6),0x14100e,{x:.72,y:.64,z:.14});
 add(laying(.04,.04,.03,6),0x14100e,{x:.72,y:.64,z:-.14});
 // four stubby legs
 for(const x of [-.32,.32])for(const z of [-.16,.16]){
  add(new THREE.CylinderGeometry(.05,.042,.4,5),0x6f4a33,{x,y:.2,z});
 }
 // Thin curly tail: three short segments rising from the top of the rump and
 // curling back over themselves, the way a piglet's does.
 add(new THREE.CylinderGeometry(.028,.034,.12,5),0x8a5a3b,{x:-.49,y:.6,rz:.9});
 add(new THREE.CylinderGeometry(.02,.026,.11,5),0x8a5a3b,{x:-.54,y:.66,rz:2.4});
 add(new THREE.CylinderGeometry(.014,.02,.09,5),0x8a5a3b,{x:-.48,y:.69,rz:3.5});
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
  this.tipAxis=new THREE.Vector3(0,0,1);
  this.tip=new THREE.Quaternion();
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
   yaw:seededUnit(id,'yaw')*Math.PI*2,size:.85+seededUnit(id,'size')*.3,
   alpha:1,solo:null,tip:0,visible:true};
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
  // Tip in the boar's own frame after the spin, so it always falls sideways.
  this.tip.setFromAxisAngle(this.tipAxis,-item.tip*Math.PI/2);
  this.dummy.quaternion.copy(this.upright).multiply(this.spin).multiply(this.tip);
  this.dummy.position.copy(item.position);
  this.dummy.scale.setScalar(item.visible?item.size:0);
  // A fading carcass has left the batch for its own mesh, so it can be drawn
  // translucent without touching every other boar's material.
  if(item.solo){
   item.solo.position.copy(this.dummy.position);
   item.solo.quaternion.copy(this.dummy.quaternion);
   item.solo.scale.copy(this.dummy.scale);
   return;
  }
  this.dummy.updateMatrix();
  item.batch.mesh.setMatrixAt(item.index,this.dummy.matrix);
  item.batch.mesh.instanceMatrix.needsUpdate=true;
 }
 // Behaviour owns where a boar stands and which way it faces; the art only draws it.
 place(id,position,yaw){
  const item=this.items.get(id);
  if(!item)return false;
  item.position.copy(position);
  item.yaw=yaw;
  this.transform(item);
  return true;
 }
 // Every boar in a batch shares one material, so the first translucent frame
 // moves this one onto its own mesh with a copy of it; from then on alpha is its.
 setFade(id,alpha){
  const item=this.items.get(id);
  if(!item)return;
  const next=Math.max(0,Math.min(1,alpha));
  if(item.alpha===next)return;
  item.alpha=next;
  if(next<1&&!item.solo)this.detach(item);
  if(item.solo)item.solo.material.opacity=next;
 }
 detach(item){
  const batch=item.batch,last=batch.entries.pop();
  if(last!==item){batch.entries[item.index]=last;last.index=item.index;this.transform(last);}
  batch.mesh.count=batch.entries.length;
  const material=this.material.clone();
  material.transparent=true;
  material.opacity=item.alpha;
  item.solo=new THREE.Mesh(this.geometry,material);
  this.root.add(item.solo);
  this.transform(item);
 }
 // Death lays the pig over onto its side and leaves it there as a carcass.
 setTip(id,tip){
  const item=this.items.get(id);
  if(!item)return;
  const next=Math.max(0,Math.min(1,tip));
  if(item.tip===next)return;
  item.tip=next;
  this.transform(item);
 }
 unload(id){
  const item=this.items.get(id);
  if(!item)return;
  if(item.solo){
   this.root.remove(item.solo);
   item.solo.material.dispose();
   this.items.delete(id);
   return;
  }
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
