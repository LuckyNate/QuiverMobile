import * as THREE from 'three';
import {PlayerControls} from './player-controls.js';
import {PlayerAvatar} from './player-avatar.js';
import {CameraCollision} from './engine/camera-collision.js';

// GTA-style third-person navigation adapted to radial planetary gravity.
// Physics in main.js remains the sole authority for world-space position.
export class PlayerSystem {
 constructor(scene,camera,canvas,radius,report){
  this.position=new THREE.Vector3(0,0,radius+2);
  this.camera=camera;
  this.controls=new PlayerControls(canvas);
  this.visual=new PlayerAvatar(scene,report);
  this.frameUp=null;this.forward=null;
  this.heading=0;this.cameraHeading=0;this.cameraPitch=.22;
  this.cameraLookCooldown=0;this.isMoving=false;
  this.viewZoom=8;this.cameraPosition=null;this.lastTurn=0;
  this.cameraCollision=null;
  this.walkDestination=null;
 }
 setDestination(position){this.walkDestination=position.clone();}
 cancelDestination(){this.walkDestination=null;}
 setCameraCollision(height,radius){this.cameraCollision=new CameraCollision(height,radius);}
 basis(){
  const up=this.position.clone().normalize();
  if(!this.frameUp){
   const ref=Math.abs(up.y)<.9?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1);
   this.forward=ref.addScaledVector(up,-ref.dot(up)).normalize();
  }else{
   this.forward.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(this.frameUp,up));
   this.forward.addScaledVector(up,-this.forward.dot(up)).normalize();
  }
  this.frameUp=up.clone();
  return {up,north:this.forward.clone(),east:new THREE.Vector3().crossVectors(this.forward,up).normalize()};
 }
 // GTA-like movement: stick direction is relative to the orbit camera,
 // character turns smoothly into travel direction instead of tank steering.
 movement(dt){
  const {north,east}=this.basis(),{x,y}=this.controls.axes();
  // Automatic walking feeds the same physics and avatar animation as manual movement.
  let auto=null;
  if(this.walkDestination){
   const up=this.position.clone().normalize();
   const delta=this.walkDestination.clone().sub(this.position);
   delta.addScaledVector(up,-delta.dot(up));
   const distance=delta.length();
   if(distance<.65)this.walkDestination=null;
   else auto=delta.multiplyScalar(Math.min(1,distance/2)/distance);
  }
  // Movement uses the two-handed camera-relative stick (or keyboard).
  const cameraForward=north.clone().multiplyScalar(Math.cos(this.cameraHeading))
   .addScaledVector(east,Math.sin(this.cameraHeading));
  const cameraRight=east.clone().multiplyScalar(Math.cos(this.cameraHeading))
   .addScaledVector(north,-Math.sin(this.cameraHeading));
  const move=auto||cameraForward.multiplyScalar(y).addScaledVector(cameraRight,x).clampLength(0,1);
  this.isMoving=move.lengthSq()>.01;
  if(this.isMoving){
   const target=Math.atan2(move.dot(east),move.dot(north));
   const diff=THREE.MathUtils.euclideanModulo(target-this.heading+Math.PI,Math.PI*2)-Math.PI;
   const step=THREE.MathUtils.clamp(diff,-9*dt,9*dt);
   this.heading+=step;this.lastTurn=step/Math.max(dt,.001);
   this.showAnimation('Walking');
  }else{this.lastTurn=0;this.showAnimation('Idle');}
  return move;
 }
 updateView(dt=1/60){
  const {up,north,east}=this.basis();
  const look=this.controls.consumeLook();
  this.cameraHeading+=look.x*.006;
  if(Math.abs(look.x)+Math.abs(look.y)>.01)this.cameraLookCooldown=1.25;
  else this.cameraLookCooldown=Math.max(0,this.cameraLookCooldown-dt);
  // Recenter only while moving and after the right thumb releases camera control.
  if(this.isMoving&&this.cameraLookCooldown===0){
   const delta=THREE.MathUtils.euclideanModulo(this.heading-this.cameraHeading+Math.PI,Math.PI*2)-Math.PI;
   this.cameraHeading+=delta*(1-Math.exp(-1.4*dt));
  }
  this.cameraPitch=THREE.MathUtils.clamp(this.cameraPitch+look.y*.004,-.35,1.15);
  const facing=north.clone().multiplyScalar(Math.cos(this.heading)).addScaledVector(east,Math.sin(this.heading));
  const cameraForward=north.clone().multiplyScalar(Math.cos(this.cameraHeading))
   .addScaledVector(east,Math.sin(this.cameraHeading));
  const alpha=1-Math.exp(-6*dt);
  this.viewZoom+=(this.controls.zoom-this.viewZoom)*alpha;
  const distance=this.viewZoom;
  const globalZoom=THREE.MathUtils.smoothstep(Math.log(distance),Math.log(40),Math.log(this.camera.far));
  const focus=this.position.clone().addScaledVector(up,1.1);
  const chase=focus.clone().addScaledVector(up,Math.sin(this.cameraPitch)*distance)
   .addScaledVector(cameraForward,-Math.cos(this.cameraPitch)*distance);
  const overhead=focus.clone().addScaledVector(up,distance);
  const desired=chase.lerp(overhead,globalZoom);
  // Immediately shorten on obstruction, slowly extend when the view clears.
  const clearGoal=this.cameraCollision?this.cameraCollision.resolve(focus,desired):desired;
  if(!this.cameraPosition)this.cameraPosition=clearGoal.clone();
  else {
   const currentDistance=this.cameraPosition.distanceTo(focus);
   const wantedDistance=clearGoal.distanceTo(focus);
   this.cameraPosition.lerp(clearGoal,wantedDistance<currentDistance?1:alpha);
   // Smoothing must never push the camera into intervening ground.
   if(this.cameraCollision)this.cameraPosition.copy(this.cameraCollision.resolve(focus,this.cameraPosition));
  }
  this.camera.position.copy(this.cameraPosition);
  this.camera.up.copy(up);
  this.camera.lookAt(focus);
  this.visual.update(this.position,up,facing,dt);
 }
 showAnimation(name){this.visual.show(name);}
 playIdle(){this.showAnimation('Idle');}
 playWalking(){this.showAnimation('Walking');}
 playStrafeLeft(){this.showAnimation('Walking');}
 playStrafeRight(){this.showAnimation('Walking');}
 playBackpedal(){this.showAnimation('Walking');}
 playTurnLeft(){this.showAnimation('Turning');}
 playTurnRight(){this.showAnimation('Turning');}
 setSwimming(enabled){this.controls.setSwimming(enabled);}
 swimAxis(){return this.controls.swimAxis();}
 diveByLooking(){return Math.max(0,this.controls.axes().y)*THREE.MathUtils.smoothstep(this.cameraPitch,.45,1.15);}
}
