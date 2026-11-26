import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {withinSceneryRange} from '../render/scenery-visibility.js';

// A colour baked into a geometry, so parts of different colours share one mesh.
function paint(geometry,hex){
 const colour=new THREE.Color(hex),count=geometry.getAttribute('position').count;
 const array=new Float32Array(count*3);
 for(let i=0;i<count;i++)colour.toArray(array,i*3);
 geometry.setAttribute('color',new THREE.BufferAttribute(array,3));
 return geometry;
}
// One dandy: a green stem and a yellow head, merged into a single geometry with
// vertex colours. That keeps every flower in one instanced mesh and one draw
// call, exactly like the sticks and stones it is picked up beside.
function flowerGeometry(){
 const stem=new THREE.CylinderGeometry(.012,.022,.4,4,1).translate(0,.2,0).toNonIndexed();
 const head=new THREE.IcosahedronGeometry(.11,0).translate(0,.43,0);
 paint(stem,0x4f7a33);paint(head,0xf2d43c);
 const merged=mergeGeometries([stem,head],false);
 stem.dispose();head.dispose();
 if(!merged)throw new Error('Dandy flower geometry merge failed');
 return merged;
}

// Stick, stone and dandy follow exactly the same seeded biome spawn/unload contract as trees.
export class GroundResources {
 constructor({root,shared,player,playerId}){
  Object.assign(this,{root,shared,player,playerId});
  this.items=new Map();
  this.targetId=null;
  const stickGeometry=new THREE.CylinderGeometry(.045,.065,.9,5);
  stickGeometry.rotateZ(Math.PI/2);
  const stoneGeometry=new THREE.DodecahedronGeometry(.22,0);
  // One table for everything bare hands can pick off the ground: what it looks
  // like, how high it rides over the surface, and which bag slot it fills. A new
  // pickup is one entry here and one line in the handler, not a new pipeline.
  this.styles={
   stick:{geometry:stickGeometry,material:new THREE.MeshStandardMaterial({color:0x795230,roughness:1}),lift:.09,award:'sticks'},
   stone:{geometry:stoneGeometry,material:new THREE.MeshStandardMaterial({color:0x828484,roughness:1}),lift:.2,award:'stones'},
   dandy:{geometry:flowerGeometry(),material:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85}),lift:.1,award:'dandies'}
  };
  this.batches=new Map();this.dummy=new THREE.Object3D();
 }
 spawn(type,id,position){
  if(this.items.has(id))return false;
  const style=this.styles[type];
  if(!style)return false;
  const saved=this.shared?.getEntity(id);
  if(saved&&saved.state!=='standing')return false;
  const batches=this.batches.get(type)||[];
  if(!this.batches.has(type))this.batches.set(type,batches);
  let batch=batches.find(v=>v.entries.length<v.capacity);
  if(!batch){
   const capacity=batches.length?Math.min(4096,batches[batches.length-1].capacity*2):128;
   const mesh=new THREE.InstancedMesh(style.geometry,style.material,capacity);
   mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
   this.root.add(mesh);batch={mesh,entries:[],capacity};batches.push(batch);
  }
  const item={id,type,position:position.clone(),batch,index:batch.entries.length,group:{visible:true},state:'standing',progress:0,
   geometry:style.geometry,material:style.material,lift:style.lift,award:style.award};
  batch.entries.push(item);batch.mesh.count=batch.entries.length;
  this.updateInstance(item);
  this.items.set(id,item);
  // The instance, not a bare true: the host remembers what was made.
  return item;
 }
 select(id){this.targetId=this.items.get(id)?.state==='standing'?id:null;}
 clearSelection(){this.targetId=null;}
 isBusy(id){return this.items.get(id)?.state==='flying';}
 updateInstance(item){
  if(!item.batch)return;
  const up=item.position.clone().normalize();
  this.dummy.position.copy(item.position).addScaledVector(up,item.lift);
  this.dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),up);
  this.dummy.scale.setScalar(item.group.visible?1:0);this.dummy.updateMatrix();
  item.batch.mesh.setMatrixAt(item.index,this.dummy.matrix);
  item.batch.mesh.instanceMatrix.needsUpdate=true;
 }
 removeInstance(item){
  const batch=item.batch;if(!batch)return;
  const last=batch.entries.pop();
  if(last!==item){batch.entries[item.index]=last;last.index=item.index;this.updateInstance(last);}
  batch.mesh.count=batch.entries.length;item.batch=null;
 }
 detach(item){
  this.removeInstance(item);
  const group=new THREE.Group();
  group.position.copy(item.position);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),item.position.clone().normalize());
  const mesh=new THREE.Mesh(item.geometry,item.material);
  mesh.position.y=item.lift;group.add(mesh);this.root.add(group);item.group=group;
 }
 unload(id){
  const item=this.items.get(id);if(!item||this.isBusy(id))return;
  if(item.batch)this.removeInstance(item);else this.root.remove(item.group);
  this.items.delete(id);
  if(this.targetId===id)this.clearSelection();
 }
 update(dt,body){
  const avatar=body?.getPosition();if(!avatar)return;
  const avatarPoint=new THREE.Vector3(avatar.x,avatar.y,avatar.z);
  for(const item of this.items.values()){
   if(item.state==='standing'){
    const visible=withinSceneryRange(item.position,this.player.position);
    if(item.group.visible!==visible){item.group.visible=visible;this.updateInstance(item);}
    const up=item.position.clone().normalize();
    const delta=avatarPoint.clone().sub(item.position);
    const altitude=delta.dot(up);
    const lateral=delta.addScaledVector(up,-altitude).length();
    if(item.id!==this.targetId||lateral>1.05||altitude<-.6||altitude>2.3)continue;
    this.clearSelection();
    this.detach(item);
    item.state='flying';item.progress=0;
    this.shared?.setEntity(item.id,{state:'collected',ownerId:this.playerId});
   }else if(item.state==='flying'){
    const target=this.player.position.clone().addScaledVector(this.player.position.clone().normalize(),1);
    const delta=target.sub(item.group.position),distance=delta.length();
    item.group.position.addScaledVector(delta,Math.min(1,dt*22/Math.max(.001,distance)));
    item.group.scale.setScalar(Math.max(.05,Math.min(1,distance/3)));
    if(distance<.4){
     this.shared?.awardResource(this.playerId,item.award,1);
     this.root.remove(item.group);this.items.delete(item.id);
    }
   }
  }
 }
}
