import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

// Owns tree meshes only; resource identity, persistence and physics live elsewhere.
export class TreeVisual {
 constructor(trunkMaterial,leafMaterial){
  this.trunkMaterial=trunkMaterial;
  this.leafMaterial=leafMaterial;
  this.trunkGeometry=null;
  this.foliageGeometry=null;
  this.instances=new Set();
  // The conifer GLB belongs to this resource type only; trees can spawn before it loads.
  new GLTFLoader().load(import.meta.env.BASE_URL+'conifer.glb',gltf=>{
   const trunk=gltf.scene.getObjectByName('Trunk');
   const foliage=gltf.scene.getObjectByName('Foliage');
   if(!trunk?.isMesh||!foliage?.isMesh)return;
   this.trunkGeometry=trunk.geometry;
   this.foliageGeometry=foliage.geometry;
   for(const instance of this.instances){
    instance.trunk.geometry.dispose();
    instance.foliage.geometry.dispose();
    instance.trunk.geometry=this.trunkGeometry;
    instance.foliage.geometry=this.foliageGeometry;
    instance.trunk.position.y=0;
    instance.foliage.position.y=1;
   }
  },undefined,error=>console.error('Conifer GLB unavailable; retaining tree geometry',error));
 }
 create(position){
  const tree=new THREE.Group();
  tree.position.copy(position);
  tree.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),position.clone().normalize());
  const visual=new THREE.Group();
  tree.add(visual);
  const trunk=new THREE.Mesh(this.trunkGeometry||new THREE.CylinderGeometry(.24,.31,4,8),this.trunkMaterial);
  trunk.position.y=this.trunkGeometry?0:2;
  const foliage=new THREE.Mesh(this.foliageGeometry||new THREE.ConeGeometry(1.35,4.5,8),this.leafMaterial.clone());
  foliage.position.y=this.foliageGeometry?1:3.25;
  visual.add(trunk,foliage);
  this.instances.add({trunk,foliage});
  return {tree,visual,trunk,foliage};
 }
 release(trunk,foliage){
  for(const instance of this.instances)if(instance.trunk===trunk){this.instances.delete(instance);break;}
  if(trunk.geometry!==this.trunkGeometry)trunk.geometry.dispose();
  if(foliage.geometry!==this.foliageGeometry)foliage.geometry.dispose();
 }
}
