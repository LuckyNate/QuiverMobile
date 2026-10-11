import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

// Lightweight harvestables: the same automatic attack cycle can target enemies later.
// A tree is a vertical log plus foliage; harvesting never creates falling physics bodies.
export class TreeHarvestSystem {
 constructor(scene,player,height,radius){
  Object.assign(this,{scene,player,height,radius});
  this.trees=[];this.wood=0;this.attackClock=0;
  this.root=new THREE.Group();scene.add(this.root);
  this.woodLabel=document.createElement('div');
  this.woodLabel.style.cssText='position:fixed;right:12px;bottom:12px;color:white;background:#0009;padding:8px;font:14px monospace;z-index:4;pointer-events:none';
  document.getElementById('app').append(this.woodLabel);
  this.showWood();
  const trunkGeometry=new THREE.CylinderGeometry(.24,.31,3.66,7);
  trunkGeometry.translate(0,1.83,0);
  const canopyGeometry=new THREE.ConeGeometry(1.35,3.2,7);
  canopyGeometry.translate(0,4.1,0);
  this.fallback=new THREE.Group();
  this.fallback.add(new THREE.Mesh(trunkGeometry,new THREE.MeshStandardMaterial({color:0x705038,roughness:1})));
  this.fallback.add(new THREE.Mesh(canopyGeometry,new THREE.MeshStandardMaterial({color:0x315934,roughness:1,transparent:true})));
  // The asset may replace the geometry without changing the harvesting behavior.
  new GLTFLoader().loadAsync(import.meta.env.BASE_URL+'models/scenery/tree.glb')
   .then(gltf=>{
    this.fallback=gltf.scene;
    for(const tree of this.trees)if(tree.state==='standing'){
     tree.visual.clear();tree.visual.add(this.fallback.clone(true));
    }
   }).catch(()=>{}); // Procedural fallback remains playable without a supplied GLB.
  this.populate();
 }
 showWood(){this.woodLabel.textContent='Logs: '+this.wood;}
 populate(){
  const base=this.player.position.clone().normalize();
  const reference=Math.abs(base.z)<.9?new THREE.Vector3(0,0,1):new THREE.Vector3(0,1,0);
  const east=new THREE.Vector3().crossVectors(base,reference).normalize();
  const north=new THREE.Vector3().crossVectors(east,base).normalize();
  // Deterministic starter grove around the landing point, avoiding its center.
  for(let i=0;i<18;i++){
   const angle=i*2.399963229728653;
   const distance=9+Math.sqrt(i+1)*4;
   const direction=base.clone().addScaledVector(east,Math.cos(angle)*distance/this.radius)
    .addScaledVector(north,Math.sin(angle)*distance/this.radius).normalize();
   const elevation=this.height.height(direction);
   if(elevation<-.5)continue;
   const at=direction.clone().multiplyScalar(this.radius+elevation);
   const tree=new THREE.Group();
   tree.position.copy(at);
   tree.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);
   const visual=new THREE.Group();visual.add(this.fallback.clone(true));tree.add(visual);
   this.root.add(tree);
   this.trees.push({tree,visual,at,state:'standing',progress:0,hits:0});
  }
 }
 update(dt){
  const player=this.player.position;
  this.attackClock=Math.max(0,this.attackClock-dt);
  // Attack any standing tree in range automatically, no harvesting input.
  if(this.attackClock===0){
   let nearest=null,distance=2.5;
   for(const tree of this.trees){
    if(tree.state!=='standing')continue;
    const d=tree.at.distanceTo(player);
    if(d<distance){nearest=tree;distance=d;}
   }
   if(nearest){
    this.attackClock=.6;
    this.player.showAnimation('Axe Attack');
    if(++nearest.hits>=2){nearest.state='falling';nearest.progress=0;}
   }
  }
  for(const tree of this.trees){
   if(tree.state!=='falling')continue;
   tree.progress=Math.min(1,tree.progress+dt/1.1);
   const t=tree.progress;
   tree.visual.rotation.z=-Math.PI*.48*THREE.MathUtils.smoothstep(t,0,.8);
   tree.visual.scale.setScalar(1-.98*THREE.MathUtils.smoothstep(t,.55,1));
   tree.visual.traverse(node=>{
    if(!node.isMesh)return;
    if(!node.userData.harvestMaterials){
     node.material=Array.isArray(node.material)?node.material.map(m=>m.clone()):node.material.clone();
     node.userData.harvestMaterials=true;
    }
    const mats=Array.isArray(node.material)?node.material:[node.material];
    for(const m of mats){
     if(m.color?.g>m.color?.r*1.05){
      m.transparent=true;m.opacity=Math.max(0,1-THREE.MathUtils.smoothstep(t,.1,.85));
      m.depthWrite=false;
     }
    }
   });
   if(t>=1){
    tree.state='collected';tree.tree.visible=false;this.wood++;this.showWood();
   }
  }
 }
}
