import * as THREE from 'three';
import {refineAvatarShape} from './engine/avatar-shape.js';
import {JimBody} from './engine/jim-body.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

// Box3D owns the player capsule. Jim owns the visual articulated body,
// planted supports, and predictive IK; the existing GLB remains a fallback.
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
  this.glb=null;
  this.jim=null;
  try{this.jim=new JimBody(this.root);}
  catch(error){console.warn('Jim procedural avatar unavailable; using GLB',error);}
  report('GLB player','LOADING','Loading block avatar fallback');
  const avatarUrl=new URL('models/debug/quiver_block_avatar.glb',document.baseURI).href;
  new GLTFLoader().load(avatarUrl,gltf=>{
   refineAvatarShape(gltf.scene);
   this.root.add(gltf.scene);
   this.glb=gltf.scene;
   this.glb.visible=!this.jim;
   this.mixer=new THREE.AnimationMixer(gltf.scene);
   for(const clip of gltf.animations)this.actions.set(clip.name,this.mixer.clipAction(clip));
   this.show(this.animation);
   report('GLB player','READY',this.jim?'Jim articulated IK; GLB fallback loaded':'Block avatar fallback');
  },undefined,error=>{
   // The original asset failure still matters for the normal readiness check.
   report('GLB player','FAILED',error?.message||String(error));
  });
 }
 setTerrain(height,radius){if(this.jim)this.jim.setTerrain(height,radius);}
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
  if(this.jim){
   try{this.jim.update(position,up,dt);}
   catch(error){
    console.warn('Jim IK fallback',error);
    this.jim.visual.visible=false;
    this.jim=null;
    if(this.glb)this.glb.visible=true;
   }
  }
  if(this.mixer&&!this.jim)this.mixer.update(dt);
  if(this.contactFlash>0){
   this.contactFlash=Math.max(0,this.contactFlash-dt);
   if(this.contactFlash===0)this.capsuleMaterial.color.copy(this.capsuleBaseColor);
  }
 }
}
