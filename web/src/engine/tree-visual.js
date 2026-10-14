import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

// Owns tree meshes only; resource identity, persistence and physics live elsewhere.
export class TreeVisual {
 constructor(trunkMaterial,leafMaterial,root){
  this.root=root;this.batches=new Map();this.dummy=new THREE.Object3D();
  this.trunkMaterial=trunkMaterial;
  this.leafMaterial=leafMaterial;
  this.trunkGeometry=null;
  this.foliageGeometry=null;
  this.instances=new Set();
  this.fallbackTrunk=new THREE.CylinderGeometry(.24,.31,4,8);
  this.fallbackFoliage=new THREE.ConeGeometry(1.35,4.5,8);
  // GLB foliage is open underneath. A downward-facing shared cap closes the base.
  this.foliageCapGeometry=new THREE.CircleGeometry(1.35,8);
  this.foliageCapGeometry.rotateX(Math.PI/2);
  // The conifer GLB belongs to this resource type only; trees can spawn before it loads.
  new GLTFLoader().load(import.meta.env.BASE_URL+'conifer.glb',gltf=>{
   const trunk=gltf.scene.getObjectByName('Trunk');
   const foliage=gltf.scene.getObjectByName('Foliage');
   if(!trunk?.isMesh||!foliage?.isMesh)return;
   this.trunkGeometry=trunk.geometry;
   this.foliageGeometry=foliage.geometry;
   for(const batches of this.batches.values())for(const batch of batches){
    batch.mesh.geometry=batch.kind==='trunk'?this.trunkGeometry:batch.kind==='foliage'?this.foliageGeometry:this.foliageCapGeometry;
    for(const entry of batch.entries)this.setInstanceTransform(entry);
   }
   for(const instance of this.instances){
    // Shared fallback geometry remains owned by this renderer.
    instance.trunk.geometry=this.trunkGeometry;
    instance.foliage.geometry=this.foliageGeometry;
    this.capFoliage(instance.foliage);
    instance.trunk.position.y=0;
    instance.foliage.position.y=1;
   }
  },undefined,error=>console.error('Conifer GLB unavailable; retaining tree geometry',error));
 }
 capFoliage(foliage){
  if(foliage.userData.baseCap)return;
  const cap=new THREE.Mesh(this.foliageCapGeometry,foliage.material);
  cap.position.y=-.008;
  foliage.add(cap);
  foliage.userData.baseCap=cap;
 }
 batch(kind){
  let batches=this.batches.get(kind);
  if(!batches){batches=[];this.batches.set(kind,batches);}
  let batch=batches.find(b=>b.entries.length<b.capacity);
  if(batch)return batch;
  const capacity=batches.length?Math.min(4096,batches[batches.length-1].capacity*2):128;
  const geometry=kind==='trunk'?(this.trunkGeometry||this.fallbackTrunk):
   kind==='foliage'?(this.foliageGeometry||this.fallbackFoliage):this.foliageCapGeometry;
  const mesh=new THREE.InstancedMesh(geometry,kind==='trunk'?this.trunkMaterial:this.leafMaterial,capacity);
  mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  this.root.add(mesh);batch={mesh,entries:[],capacity,kind};batches.push(batch);return batch;
 }
 setInstanceTransform(entry){
  const t=entry.tree;
  this.dummy.position.copy(t.position);
  this.dummy.quaternion.copy(t.quaternion);
  const offset=entry.kind==='trunk'?(this.trunkGeometry?0:2):
   entry.kind==='foliage'?(this.foliageGeometry?1:3.25):
   (this.foliageGeometry?.992:1);
  const up=new THREE.Vector3(0,offset,0).applyQuaternion(t.quaternion);
  this.dummy.position.add(up);
  this.dummy.scale.setScalar(entry.visible?1:0);this.dummy.updateMatrix();
  entry.batch.mesh.setMatrixAt(entry.index,this.dummy.matrix);
  entry.batch.mesh.instanceMatrix.needsUpdate=true;
 }
 attach(entry){
  entry.renderInstances=[];
  for(const kind of ['trunk','foliage','cap']){
   const batch=this.batch(kind);
   const record={tree:entry.tree,kind,batch,index:batch.entries.length,visible:true};
   batch.entries.push(record);batch.mesh.count=batch.entries.length;
   entry.renderInstances.push(record);this.setInstanceTransform(record);
  }
  entry.tree.visible=false;
 }
 remove(entry){
  for(const record of entry.renderInstances||[]){
   const batch=record.batch,last=batch.entries.pop();
   if(last!==record){batch.entries[record.index]=last;last.index=record.index;this.setInstanceTransform(last);}
   batch.mesh.count=batch.entries.length;
  }
  entry.renderInstances=[];
 }
 setVisible(entry,visible){
  for(const record of entry.renderInstances||[])if(record.visible!==visible){
   record.visible=visible;this.setInstanceTransform(record);
  }
 }
 activate(entry){
  this.remove(entry);
  entry.tree.visible=true;
 }
 create(position){
  const tree=new THREE.Group();
  tree.position.copy(position);
  tree.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),position.clone().normalize());
  const visual=new THREE.Group();
  tree.add(visual);
  const trunk=new THREE.Mesh(this.trunkGeometry||this.fallbackTrunk,this.trunkMaterial);
  trunk.position.y=this.trunkGeometry?0:2;
  const foliage=new THREE.Mesh(this.foliageGeometry||this.fallbackFoliage,this.leafMaterial.clone());
  foliage.position.y=this.foliageGeometry?1:3.25;
  if(this.foliageGeometry)this.capFoliage(foliage);
  visual.add(trunk,foliage);
  this.instances.add({trunk,foliage});
  return {tree,visual,trunk,foliage};
 }
 release(trunk,foliage){
  for(const instance of this.instances)if(instance.trunk===trunk){this.instances.delete(instance);break;}
  // All source geometries are shared; only instance-specific materials are disposed by caller.
 }
}
