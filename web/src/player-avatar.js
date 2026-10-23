import * as THREE from 'three';
import {refineAvatarShape} from './engine/avatar-shape.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

// The physics capsule remains the authority for contact and position.
// The procedural capsule is retained as a translucent visual shell.
export class PlayerAvatar {
 constructor(scene,report){
  const material=new THREE.MeshStandardMaterial({
   color:0xa3afbc,roughness:.8,metalness:0,transparent:true,opacity:.4,depthWrite:false
  });
  this.root=new THREE.Group();
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(.35,1.1,6,10),material);
  this.root.add(body);
  this.capsuleMaterial=material;
  this.capsuleBaseColor=material.color.clone();
  this.contactFlash=0;
  scene.add(this.root);
  this.animation='Idle';
  this.mixer=null;
  this.actions=new Map();
  this.currentAction=null;
  report('GLB player','LOADING','Loading block avatar');
  // Resolve beside the current web entry point on desktop and Android WebView.
  const avatarUrl=new URL('models/debug/quiver_block_avatar.glb',document.baseURI).href;
  new GLTFLoader().load(avatarUrl,gltf=>{
   refineAvatarShape(gltf.scene);
   this.root.add(gltf.scene);
   this.mixer=new THREE.AnimationMixer(gltf.scene);
   for(const clip of gltf.animations){
    this.actions.set(clip.name,this.mixer.clipAction(clip));
   }
   this.show(this.animation);
   report('GLB player','READY','Block avatar loaded; capsule retained');
  },undefined,error=>{
   report('GLB player','FAILED',error?.message||String(error));
  });
 }
 flashResourceContact(){this.contactFlash=.22;this.capsuleMaterial.color.setHex(0x22ff55);}
 show(state){
  this.animation=state;
  const action=this.actions.get(state)||this.actions.get('Idle');
  if(!action||action===this.currentAction)return;
  if(this.currentAction)this.currentAction.fadeOut(.12);
  action.reset().fadeIn(.12).play();
  this.currentAction=action;
 }
 update(position,up,forward,dt=1/60){
  this.root.position.copy(position);
  const f=forward.clone().addScaledVector(up,-forward.dot(up)).normalize();
  const right=new THREE.Vector3().crossVectors(up,f).normalize();
  this.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,f));
  if(this.mixer)this.mixer.update(dt);
  if(this.contactFlash>0){
   this.contactFlash=Math.max(0,this.contactFlash-dt);
   if(this.contactFlash===0)this.capsuleMaterial.color.copy(this.capsuleBaseColor);
  }
 }
}
