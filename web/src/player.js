import * as THREE from 'three';
import {PlayerControls} from './player-controls.js';
import {PlayerAvatar} from './player-avatar.js';

// Player position is written by the physics engine in main.js.
// This adapter supplies controls, tangent-frame navigation and a following view.
export class PlayerSystem {
 constructor(scene,camera,canvas,radius,report){
  this.scene=scene;this.camera=camera;
  this.position=new THREE.Vector3(0,0,radius+1.3);
  this.controls=new PlayerControls(canvas);
  this.visual=new PlayerAvatar(scene,report);
  this.facingYaw=0;this.cameraYaw=0;this.cameraPitch=.35;
  this.frameUp=null;this.frameForward=null;this.cameraTarget=null;
  this.viewZoom=8;this.lastTurn=0;
 }
 basis(){
  const up=this.position.clone().normalize();
  if(!this.frameUp){
   const reference=Math.abs(up.y)<.9?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1);
   this.frameForward=reference.addScaledVector(up,-reference.dot(up)).normalize();
  }else{
   const transport=new THREE.Quaternion().setFromUnitVectors(this.frameUp,up);
   this.frameForward.applyQuaternion(transport);
   this.frameForward.addScaledVector(up,-this.frameForward.dot(up)).normalize();
  }
  this.frameUp=up;
  const north=this.frameForward.clone();
  const east=new THREE.Vector3().crossVectors(north,up).normalize();
  return {up,north,east};
 }
 movement(dt){
  const {north,east}=this.basis();
  const {x,y}=this.controls.axes();
  const two=this.controls.mode==='two';
  let turn=0;
  if(!two){turn=x;this.facingYaw+=turn*2.2*dt;}
  else{
   const difference=THREE.MathUtils.euclideanModulo(this.cameraYaw-this.facingYaw+Math.PI,2*Math.PI)-Math.PI;
   turn=THREE.MathUtils.clamp(difference/(2.2*Math.max(dt,.001)),-1,1);
   this.facingYaw+=difference*(1-Math.exp(-12*dt));
  }
  this.lastTurn=turn;
  if(Math.abs(y)+(two?Math.abs(x):0)<.12)
   this.showAnimation(Math.abs(turn)>.18?(turn<0?'Turn Left':'Turn Right'):'Idle');
  else this.showAnimation('Walking ('+(two?(y<0?'Back':Math.abs(x)>Math.abs(y)?x<0?'Left':'Right':'Forward'):turn<-.3?'Left':turn>.3?'Right':y<0?'Back':'Forward')+')');
  const facing=north.clone().multiplyScalar(Math.cos(this.facingYaw)).addScaledVector(east,Math.sin(this.facingYaw));
  const right=east.clone().multiplyScalar(Math.cos(this.facingYaw)).addScaledVector(north,-Math.sin(this.facingYaw));
  return facing.multiplyScalar(y).addScaledVector(right,two?x:0).clampLength(0,1);
 }
 updateView(dt=1/60){
  const {up,north,east}=this.basis();
  const look=this.controls.consumeLook();
  if(this.controls.mode==='two'){
   this.cameraYaw+=look.x*.007;
   this.cameraPitch=THREE.MathUtils.clamp(this.cameraPitch+look.y*.007,-.1,1.45);
  }else{
   const diff=THREE.MathUtils.euclideanModulo(this.facingYaw-this.cameraYaw+Math.PI,2*Math.PI)-Math.PI;
   this.cameraYaw+=diff*(1-Math.exp(-3*dt));
  }
  const aim=north.clone().multiplyScalar(Math.cos(this.cameraYaw)).addScaledVector(east,Math.sin(this.cameraYaw));
  this.viewZoom+=(this.controls.zoom-this.viewZoom)*(1-Math.exp(-5*dt));
  const t=THREE.MathUtils.smoothstep(Math.log(this.viewZoom),Math.log(30),Math.log(5000));
  const chase=this.position.clone().addScaledVector(up,2+this.viewZoom*Math.sin(this.cameraPitch))
   .addScaledVector(aim,-this.viewZoom*Math.cos(this.cameraPitch));
  const overhead=this.position.clone().addScaledVector(up,this.viewZoom+2);
  const target=chase.lerp(overhead,t);
  if(!this.cameraTarget)this.cameraTarget=target.clone();
  else this.cameraTarget.lerp(target,1-Math.exp(-8*dt));
  this.camera.position.copy(this.cameraTarget);
  this.camera.up.copy(up.clone().lerp(aim,t).normalize());
  this.camera.lookAt(this.position.clone().addScaledVector(up,1));
  const facing=north.clone().multiplyScalar(Math.cos(this.facingYaw)).addScaledVector(east,Math.sin(this.facingYaw));
  this.visual.update(this.position,up,facing);
 }
 showAnimation(name){this.visual.show(name);}
 playIdle(){this.showAnimation('Idle');}
 playWalking(direction='Forward'){this.showAnimation('Walking ('+direction+')');}
 playStrafeLeft(){this.showAnimation('Strafe Left');}
 playStrafeRight(){this.showAnimation('Strafe Right');}
 playBackpedal(){this.showAnimation('Backpedal');}
 playTurnLeft(){this.showAnimation('Turn Left');}
 playTurnRight(){this.showAnimation('Turn Right');}
 setZoom(value){this.controls.setZoom(value);}
 setSwimming(enabled){this.controls.setSwimming(enabled);}
 swimAxis(){return this.controls.swimAxis();}
 diveByLooking(){return Math.max(0,this.controls.axes().y)*THREE.MathUtils.smoothstep(this.cameraPitch,.45,1.35);}
}
