import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

// Player owns input, local frame, camera and avatar. Physics body stays in PhysicsWorld.
export class PlayerSystem {
 constructor(scene,camera,canvas,radius,report){
  this.scene=scene;this.camera=camera;this.canvas=canvas;
  this.position=new THREE.Vector3(0,0,radius+1.3);
  this.yaw=0;this.pitch=.35;this.zoom=8;this.moveX=0;this.moveY=0;
  this.keys=new Set();this.touches=new Map();this.lookPointer=null;this.avatar=null;
  report('GLB player','LOADING');
  new GLTFLoader().loadAsync(import.meta.env.BASE_URL+'models/debug/player_capsule.glb')
   .then(capsule=>{this.avatar=capsule.scene;scene.add(this.avatar);report('GLB player','READY');})
   .catch(error=>report('GLB player','FAILED',error.message));
  window.addEventListener('keydown',e=>{this.keys.add(e.key.toLowerCase());if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key.toLowerCase()))e.preventDefault();});
  window.addEventListener('keyup',e=>this.keys.delete(e.key.toLowerCase()));
  canvas.addEventListener('pointerdown',e=>{
   canvas.setPointerCapture(e.pointerId);
   this.touches.set(e.pointerId,{x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY});
   if(e.clientX>innerWidth/2)this.lookPointer=e.pointerId;
  });
  canvas.addEventListener('pointermove',e=>{
   const p=this.touches.get(e.pointerId);if(!p)return;
   const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
   if(e.pointerId===this.lookPointer){this.yaw+=dx*.007;this.pitch=THREE.MathUtils.clamp(this.pitch+dy*.007,-.1,1.45);}
   else{this.moveX=THREE.MathUtils.clamp((e.clientX-p.startX)/90,-1,1);this.moveY=THREE.MathUtils.clamp((p.startY-e.clientY)/90,-1,1);}
  });
  const release=e=>{
   this.touches.delete(e.pointerId);
   if(this.lookPointer===e.pointerId)this.lookPointer=null;
   if(![...this.touches].some(([id])=>id!==this.lookPointer)){this.moveX=0;this.moveY=0;}
  };
  canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
  canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom=THREE.MathUtils.clamp(this.zoom*Math.exp(e.deltaY*.001),3,30000);},{passive:false});
 }
 basis(){
  const up=this.position.clone().normalize();
  const east=new THREE.Vector3(0,1,0).cross(up).normalize();
  const north=up.clone().cross(east).normalize();
  return {up,east,north};
 }
 movement(){
  const {north,east}=this.basis();
  const ex=(this.keys.has('d')||this.keys.has('arrowright')?1:0)-(this.keys.has('a')||this.keys.has('arrowleft')?1:0)+this.moveX;
  const ey=(this.keys.has('w')||this.keys.has('arrowup')?1:0)-(this.keys.has('s')||this.keys.has('arrowdown')?1:0)+this.moveY;
  const facing=north.clone().multiplyScalar(Math.cos(this.yaw)).addScaledVector(east,Math.sin(this.yaw));
  const side=east.clone().multiplyScalar(Math.cos(this.yaw)).addScaledVector(north,-Math.sin(this.yaw));
  const motion=facing.multiplyScalar(ey).addScaledVector(side,ex);
  if(motion.lengthSq()>1)motion.normalize();
  return motion;
 }
 updateView(){
  const {up,east,north}=this.basis();
  const aim=north.clone().multiplyScalar(Math.cos(this.yaw)).addScaledVector(east,Math.sin(this.yaw));
  const eye=this.position.clone().addScaledVector(up,2+this.zoom*Math.sin(this.pitch)).addScaledVector(aim,-this.zoom*Math.cos(this.pitch));
  this.camera.position.copy(eye);this.camera.up.copy(up);this.camera.lookAt(this.position.clone().addScaledVector(up,1));
  if(this.avatar){this.avatar.position.copy(this.position).addScaledVector(up,-1.1);this.avatar.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),up);}
 }
}
