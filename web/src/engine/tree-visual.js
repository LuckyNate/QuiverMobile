import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {renderTreeSprite} from './tree-sprite.js';

// Owns tree meshes only; resource identity, persistence and physics live elsewhere.
// Trees inside the billboard distance draw as trunk/foliage instances; the ones
// beyond it draw as one camera-facing card made from a render of the same model.
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
  this.imposterGeometry=null;
  this.imposterMaterial=null;
  this.imposters=null;
  this.billboardQuaternion=null;
  this.billboardMatrix=new THREE.Matrix4();
  this.billboardUp=new THREE.Vector3();
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
   this.buildImposter();
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
 // The card is drawn from the loaded model, so it cannot drift from the tree it
 // stands in for; the sprite carries the model's own size.
 buildImposter(){
  if(this.imposterGeometry||!this.trunkGeometry||!this.foliageGeometry)return;
  const sprite=renderTreeSprite(()=>{
   const model=new THREE.Group();
   const trunk=new THREE.Mesh(this.trunkGeometry,this.trunkMaterial);
   const foliage=new THREE.Mesh(this.foliageGeometry,this.leafMaterial.clone());
   foliage.position.y=1;
   this.capFoliage(foliage);
   model.add(trunk,foliage);
   return model;
  });
  if(!sprite)return;
  const {texture,size}=sprite;
  // The plane's bottom edge sits a few centimetres below the trunk's base so no
  // hairline of ground shows through where the terrain wobbles under it.
  const geometry=new THREE.PlaneGeometry(size.x*1.04,size.y*1.04);
  geometry.translate(0,size.y*.52-.06,0);
  this.imposterGeometry=geometry;
  // An opaque cutout, not a blended overlay: sprites drawn this way sit in the
  // depth-sorted world like any other surface instead of ghosting over it.
  this.imposterMaterial=new THREE.MeshBasicMaterial({map:texture,transparent:false,alphaTest:.5});
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
  this.clearImposter(entry);
  this.endModelFade(entry);
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
 imposterBatch(){
  if(this.imposters)return this.imposters;
  if(!this.imposterGeometry)return null;
  const capacity=2048;
  const mesh=new THREE.InstancedMesh(this.imposterGeometry,this.imposterMaterial,capacity);
  mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  this.root.add(mesh);
  this.imposters={mesh,entries:[],capacity};
  return this.imposters;
 }
 setImposter(entry,on,camera){
  if(!on){this.clearImposter(entry);return;}
  const batch=this.imposterBatch();
  if(!batch||entry.imposterIndex!=null||batch.entries.length>=batch.capacity)return;
  entry.imposterIndex=batch.entries.length;
  batch.entries.push(entry);
  batch.mesh.count=batch.entries.length;
  this.writeImposter(entry,camera);
 }
 clearImposter(entry){
  const batch=this.imposters;
  if(!batch||entry.imposterIndex==null)return;
  const index=entry.imposterIndex;
  const last=batch.entries.pop();
  if(last!==entry){batch.entries[index]=last;last.imposterIndex=index;this.writeImposter(last,this.lastCamera);}
  entry.imposterIndex=null;
  batch.mesh.count=batch.entries.length;
 }
 // A card always stands on the tree's own up and turns only around it. Copying
 // the camera's whole rotation tips it back whenever the view looks down, which
 // lifts its base off the ground.
 placeCard(object,entry,camera){
  object.position.copy(entry.tree.position);
  if(camera){
   this.billboardUp.set(0,1,0).applyQuaternion(entry.tree.quaternion);
   this.billboardMatrix.lookAt(camera.position,entry.tree.position,this.billboardUp);
   object.quaternion.setFromRotationMatrix(this.billboardMatrix);
  }else object.quaternion.copy(entry.tree.quaternion);
  object.scale.setScalar(1);
 }
 writeImposter(entry,camera){
  const batch=this.imposters;
  if(!batch||entry.imposterIndex==null)return;
  this.placeCard(this.dummy,entry,camera);
  this.dummy.updateMatrix();
  batch.mesh.setMatrixAt(entry.imposterIndex,this.dummy.matrix);
  batch.mesh.instanceMatrix.needsUpdate=true;
 }
 // The model eases in as a tree approaches the billboard distance. The card stays
 // put until the model is at full strength, so neither form arrives in one frame.
 setModelAlpha(entry,alpha){
  if(alpha>=.999){
   this.setVisible(entry,true);
   this.endModelFade(entry);
   return;
  }
  // A tree out past the billboard distance keeps its card and no per-tree material.
  if(alpha<=0){
   this.setVisible(entry,false);
   this.endModelFade(entry);
   return;
  }
  this.setVisible(entry,false);
  if(!entry.fading){
   entry.fading=true;
   // The shared trunk material is fading for one tree only, so it gets a copy.
   if(entry.trunk.material===this.trunkMaterial)entry.trunk.material=this.trunkMaterial.clone();
   entry.trunk.material.transparent=true;
   entry.foliage.material.transparent=true;
  }
  entry.tree.visible=true;
  entry.trunk.material.opacity=alpha;
  entry.foliage.material.opacity=alpha;
 }
 endModelFade(entry){
  if(!entry.fading)return;
  entry.fading=false;
  entry.tree.visible=false;
  this.restoreModelOpacity(entry);
 }
 restoreModelOpacity(entry){
  if(entry.trunk.material!==this.trunkMaterial){
   entry.trunk.material.opacity=1;
   entry.trunk.material.transparent=false;
  }
  entry.foliage.material.opacity=1;
 }
 hide(entry){
  this.setVisible(entry,false);
  this.clearImposter(entry);
  this.endModelFade(entry);
  entry.tree.visible=false;
 }
 // Cards only need turning when the view turns; a few degrees of lag is invisible
 // at the distance they are shown from.
 updateBillboards(camera){
  if(!camera)return;
  this.lastCamera=camera;
  const batch=this.imposters;
  if(!batch||!batch.entries.length)return;
  const previous=this.billboardQuaternion;
  if(previous&&previous.angleTo(camera.quaternion)<=.05)return;
  if(previous)previous.copy(camera.quaternion);
  else this.billboardQuaternion=camera.quaternion.clone();
  for(const entry of batch.entries)this.writeImposter(entry,camera);
 }
 activate(entry){
  this.clearImposter(entry);
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
