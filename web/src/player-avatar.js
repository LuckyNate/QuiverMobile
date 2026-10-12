import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

// Visual only: never influences physics position, gravity or collision.
export class PlayerAvatar {
 constructor(scene,report){
  this.scene=scene;this.mesh=null;this.animation='Idle';
  this.label=this.makeLabel();scene.add(this.label);
  report('GLB player','LOADING');
  new GLTFLoader().loadAsync(import.meta.env.BASE_URL+'models/debug/player_capsule.glb').then(gltf=>{
   const model=gltf.scene;
   model.updateWorldMatrix(true,true);
   const box=new THREE.Box3().setFromObject(model);
   // Center the mesh in its own local coordinates before orienting on the sphere.
   const center=box.getCenter(new THREE.Vector3());
   model.position.sub(center);
   const wrapper=new THREE.Group();wrapper.add(model);
   wrapper.traverse(node=>{
    if(!node.isMesh)return;
    const convert=m=>{const copy=m.clone();copy.transparent=true;copy.opacity=.15;copy.depthWrite=false;return copy;};
    node.material=Array.isArray(node.material)?node.material.map(convert):convert(node.material);
   });
   this.mesh=wrapper;scene.add(wrapper);report('GLB player','READY');
  }).catch(error=>report('GLB player','FAILED',error.message));
 }
 makeLabel(){
  const canvas=document.createElement('canvas');canvas.width=384;canvas.height=80;
  this.context=canvas.getContext('2d');this.texture=new THREE.CanvasTexture(canvas);
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:this.texture,depthTest:false,transparent:true}));
  sprite.scale.set(3.8,.8,1);sprite.renderOrder=1000;this.show('Idle',true);return sprite;
 }
 show(name,force=false){
  if(this.animation===name&&!force)return;
  this.animation=name;
  const g=this.context;g.clearRect(0,0,384,80);g.fillStyle='rgba(0,0,0,.75)';g.fillRect(0,0,384,80);
  g.fillStyle='#fff';g.font='bold 32px monospace';g.textAlign='center';g.fillText(name,192,51);
  this.texture.needsUpdate=true;
 }
 update(position,up,forward){
  if(this.mesh){
   this.mesh.position.copy(position);
   const f=forward.clone().addScaledVector(up,-forward.dot(up)).normalize();
   const right=new THREE.Vector3().crossVectors(up,f).normalize();
   const basis=new THREE.Matrix4().makeBasis(right,up,f);
   this.mesh.quaternion.setFromRotationMatrix(basis);
  }
  this.label.position.copy(position).addScaledVector(up,2.4);
 }
}
