import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

// Player owns input, local frame, camera and avatar. Physics body stays in PhysicsWorld.
export class PlayerSystem {
 constructor(scene,camera,canvas,radius,report){
  this.scene=scene;this.camera=camera;this.canvas=canvas;
  this.position=new THREE.Vector3(0,0,radius+1.3);
  this.yaw=0;this.pitch=.35;this.zoom=8;this.viewZoom=8;this.moveX=0;this.moveY=0;
  this.frameUp=null;this.frameForward=null;
  this.facingYaw=0;this.cameraYaw=0;this.cameraPitch=.35;this.lastTurn=0;this.animation='Idle';
  this.cameraTarget=null;this.lastViewTime=null;this.walkingMode='one';
  this.keys=new Set();this.touches=new Map();this.avatar=null;this.moveTouch=null;this.lookTouch=null;
  this.animationLabel=this.makeAnimationLabel();scene.add(this.animationLabel);
  this.swimUp=false;this.swimDown=false;
  report('GLB player','LOADING');
  new GLTFLoader().loadAsync(import.meta.env.BASE_URL+'models/debug/player_capsule.glb')
   .then(capsule=>{this.avatar=capsule.scene;scene.add(this.avatar);report('GLB player','READY');})
   .catch(error=>report('GLB player','FAILED',error.message));
  window.addEventListener('keydown',e=>{this.keys.add(e.key.toLowerCase());if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key.toLowerCase()))e.preventDefault();});
  window.addEventListener('keyup',e=>this.keys.delete(e.key.toLowerCase()));
  // A single finger starts a floating stick anywhere. With two fingers,
  // the left touch moves the feet and the right touch independently looks.
  const assignTouches=()=>{
   const active=[...this.touches.entries()];
   const previousMode=this.walkingMode;
   this.walkingMode=active.length>=2?'two':'one';
   if(active.length<2){
    this.moveTouch=active[0]?.[0]??null;this.lookTouch=null;
   }else{
    const sorted=active.slice().sort((a,b)=>a[1].startX-b[1].startX);
    this.moveTouch=sorted[0][0];this.lookTouch=sorted[sorted.length-1][0];
   }
   if(previousMode!==this.walkingMode){
    // Switching roles resets each stick's neutral origin without teleporting.
    for(const p of this.touches.values()){p.startX=p.x;p.startY=p.y;}
    this.moveX=0;this.moveY=0;
   }
  };
  canvas.addEventListener('pointerdown',e=>{
   if(e.pointerType==='mouse'&&e.button!==0)return;
   canvas.setPointerCapture(e.pointerId);
   this.touches.set(e.pointerId,{x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY});
   assignTouches();
  });
  canvas.addEventListener('pointermove',e=>{
   const p=this.touches.get(e.pointerId);if(!p)return;
   const dx=e.clientX-p.x,dy=e.clientY-p.y;
   p.x=e.clientX;p.y=e.clientY;
   if(e.pointerId===this.lookTouch){
    this.cameraYaw+=dx*.007;
    this.cameraPitch=THREE.MathUtils.clamp(this.cameraPitch+dy*.007,-.1,1.45);
   }
   if(e.pointerId===this.moveTouch){
    this.moveX=THREE.MathUtils.clamp((p.x-p.startX)/90,-1,1);
    this.moveY=THREE.MathUtils.clamp((p.startY-p.y)/90,-1,1);
   }
  });
  const release=e=>{
   if(!this.touches.has(e.pointerId))return;
   this.touches.delete(e.pointerId);assignTouches();
   if(this.moveTouch===null){this.moveX=0;this.moveY=0;}
   else{
    const p=this.touches.get(this.moveTouch);
    this.moveX=THREE.MathUtils.clamp((p.x-p.startX)/90,-1,1);
    this.moveY=THREE.MathUtils.clamp((p.startY-p.y)/90,-1,1);
   }
  };
  canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
  window.addEventListener('blur',()=>{this.touches.clear();assignTouches();this.moveX=0;this.moveY=0;});
  canvas.addEventListener('wheel',e=>{e.preventDefault();this.setZoom(this.zoom*Math.exp(e.deltaY*.001));},{passive:false});
  // Logarithmic vertical slider: fine control near the player, globe at the top.
  this.zoomSlider=document.createElement('input');
  this.zoomSlider.type='range';this.zoomSlider.min='0';this.zoomSlider.max='1000';
  this.zoomSlider.step='1';this.zoomSlider.setAttribute('aria-label','Camera zoom');
  this.zoomSlider.style.cssText='position:fixed;right:12px;top:18%;height:45dvh;width:28px;z-index:5;writing-mode:vertical-lr;direction:rtl;touch-action:none;accent-color:#79b0ce';
  this.zoomSlider.addEventListener('input',()=>{
   this.setZoom(3*Math.pow(10000,Number(this.zoomSlider.value)/1000));
  });
  document.getElementById('app').append(this.zoomSlider);
  this.setZoom(this.zoom);
  this.swimControls=document.createElement('div');
  this.swimControls.style.cssText='position:fixed;bottom:90px;right:16px;z-index:4;display:none;flex-direction:column;gap:10px';
  for(const [label,property] of [['UP','swimUp'],['DIVE','swimDown']]){
   const button=document.createElement('button');
   button.textContent=label;
   button.style.cssText='padding:14px 18px;background:#173b54;color:white;border:1px solid #79b0ce;border-radius:9px;font:16px monospace;touch-action:none';
   const press=e=>{e.preventDefault();this[property]=true;button.setPointerCapture(e.pointerId);};
   const release=e=>{e.preventDefault();this[property]=false;};
   button.addEventListener('pointerdown',press);
   button.addEventListener('pointerup',release);
   button.addEventListener('pointercancel',release);
   button.addEventListener('lostpointercapture',()=>{this[property]=false;});
   this.swimControls.append(button);
  }
  document.getElementById('app').append(this.swimControls);
 }
 setZoom(value){
  this.zoom=THREE.MathUtils.clamp(value,3,30000);
  if(this.zoomSlider)this.zoomSlider.value=String(Math.round(1000*Math.log(this.zoom/3)/Math.log(10000)));
 }
 diveByLooking(){
  // Pitch is positive when looking down; do not dive at the default camera tilt.
  const forward=Math.max(0,(this.keys.has('w')||this.keys.has('arrowup')?1:0)
   -(this.keys.has('s')||this.keys.has('arrowdown')?1:0)+this.moveY);
  return THREE.MathUtils.clamp(forward,0,1)*
   THREE.MathUtils.smoothstep(this.cameraPitch,.45,1.35);
 }
 swimAxis(){
  return (this.swimUp||this.keys.has(' ')?1:0)-(this.swimDown||this.keys.has('shift')?1:0);
 }
 setSwimming(enabled){
  this.swimControls.style.display=enabled?'flex':'none';
  if(!enabled){this.swimUp=false;this.swimDown=false;}
 }
 basis(){
  const up=this.position.clone().normalize();
  if(!this.frameUp){
   // Establish one initial tangent heading; it is never rederived from a global pole.
   const reference=Math.abs(up.y)<.9?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1);
   this.frameForward=reference.addScaledVector(up,-reference.dot(up)).normalize();
  }else{
   // Parallel-transport the navigation frame over the curved planet.
   const transport=new THREE.Quaternion().setFromUnitVectors(this.frameUp,up);
   this.frameForward.applyQuaternion(transport);
   this.frameForward.addScaledVector(up,-this.frameForward.dot(up)).normalize();
  }
  this.frameUp=up;
  const north=this.frameForward.clone();
  const east=north.clone().cross(up).normalize();
  return {up,east,north};
 }
 // Animation hooks: replace label updates with clip actions once clips exist.
 makeAnimationLabel(){
  const canvas=document.createElement('canvas');canvas.width=384;canvas.height=80;
  this.labelCanvas=canvas;this.labelContext=canvas.getContext('2d');
  const texture=new THREE.CanvasTexture(canvas);
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,transparent:true}));
  sprite.scale.set(3.8,.8,1);sprite.renderOrder=1000;
  this.labelTexture=texture;this.showAnimation('Idle');
  return sprite;
 }
 showAnimation(name){
  if(this.animation===name&&this.labelTexture?.version>0)return;
  this.animation=name;
  const g=this.labelContext;g.clearRect(0,0,384,80);
  g.fillStyle='rgba(0,0,0,.75)';g.fillRect(0,0,384,80);
  g.fillStyle='#ffffff';g.font='bold 32px monospace';g.textAlign='center';
  g.fillText(name,192,51);this.labelTexture.needsUpdate=true;
 }
 playIdle(){this.showAnimation('Idle');}
 // One walking clip regardless of travel direction; direction remains
 // available in the debug tag for later animation blending.
 playWalking(direction='Forward'){this.showAnimation('Walking ('+direction+')');}
 playStrafeLeft(){this.showAnimation('Strafe Left');}
 playStrafeRight(){this.showAnimation('Strafe Right');}
 playBackpedal(){this.showAnimation('Backpedal');}
 playTurnLeft(){this.showAnimation('Turn Left');}
 playTurnRight(){this.showAnimation('Turn Right');}
 selectAnimation(forward,side,turn){
  if(Math.abs(turn)>.18&&(Math.abs(forward)+Math.abs(side)<.22))
   return turn<0?this.playTurnLeft():this.playTurnRight();
  if(Math.abs(forward)+Math.abs(side)<.12)return this.playIdle();
  if(this.walkingMode==='two'){
   if(Math.abs(side)>Math.abs(forward)*1.15)return side<0?this.playStrafeLeft():this.playStrafeRight();
   return forward<0?this.playBackpedal():this.playWalking('Forward');
  }
  if(Math.abs(turn)>.3)return this.playWalking(turn<0?'Left':'Right');
  return this.playWalking(forward<0?'Back':'Forward');
 }
 movement(dt){
  const {north,east}=this.basis();
  const x=THREE.MathUtils.clamp((this.keys.has('d')||this.keys.has('arrowright')?1:0)-(this.keys.has('a')||this.keys.has('arrowleft')?1:0)+this.moveX,-1,1);
  const y=THREE.MathUtils.clamp((this.keys.has('w')||this.keys.has('arrowup')?1:0)-(this.keys.has('s')||this.keys.has('arrowdown')?1:0)+this.moveY,-1,1);
  const two=this.walkingMode==='two';
  let forward=y,side=two?x:0,turn=0;
  if(!two){
   // One hand steers the body while vertical input moves forward/backward.
   turn=x;
   this.facingYaw+=turn*2.2*dt;
  }else{
   // Right look steers facing; the left stick moves independently relative to it.
   const difference=THREE.MathUtils.euclideanModulo(this.cameraYaw-this.facingYaw+Math.PI,2*Math.PI)-Math.PI;
   turn=THREE.MathUtils.clamp(difference/(2.2*Math.max(dt,.001)),-1,1);
   this.facingYaw+=difference*(1-Math.exp(-12*dt));
  }
  this.lastTurn=turn;
  this.selectAnimation(forward,side,turn);
  const facing=north.clone().multiplyScalar(Math.cos(this.facingYaw)).addScaledVector(east,Math.sin(this.facingYaw));
  const right=east.clone().multiplyScalar(Math.cos(this.facingYaw)).addScaledVector(north,-Math.sin(this.facingYaw));
  return facing.multiplyScalar(forward).addScaledVector(right,side).clampLength(0,1);
 }
 updateView(dt=1/60){
  const {up,east,north}=this.basis();
  const k=1-Math.exp(-Math.max(0,dt)*5);
  if(this.walkingMode==='one'){
   const angle=THREE.MathUtils.euclideanModulo(this.facingYaw-this.cameraYaw+Math.PI,2*Math.PI)-Math.PI;
   this.cameraYaw+=angle*(1-Math.exp(-Math.max(0,dt)*3));
  }
  const aim=north.clone().multiplyScalar(Math.cos(this.cameraYaw)).addScaledVector(east,Math.sin(this.cameraYaw));
  this.viewZoom+=(this.zoom-this.viewZoom)*k;
  const t=THREE.MathUtils.smoothstep(Math.log(this.viewZoom),Math.log(30),Math.log(5000));
  const chase=this.position.clone().addScaledVector(up,2+this.viewZoom*Math.sin(this.cameraPitch))
   .addScaledVector(aim,-this.viewZoom*Math.cos(this.cameraPitch));
  const overhead=this.position.clone().addScaledVector(up,this.viewZoom+2);
  const target=chase.lerp(overhead,t);
  if(!this.cameraTarget)this.cameraTarget=target.clone();
  else this.cameraTarget.lerp(target,1-Math.exp(-Math.max(0,dt)*8));
  this.camera.position.copy(this.cameraTarget);
  this.camera.up.copy(up.clone().lerp(aim,t).normalize());
  this.camera.lookAt(this.position.clone().addScaledVector(up,1));
  if(this.avatar){
   this.avatar.position.copy(this.position).addScaledVector(up,-1.1);
   const forward=north.clone().multiplyScalar(Math.cos(this.facingYaw)).addScaledVector(east,Math.sin(this.facingYaw));
   const right=forward.clone().cross(up).normalize();
   const orientation=new THREE.Matrix4().makeBasis(right,up,forward);
   this.avatar.quaternion.setFromRotationMatrix(orientation);
  }
  this.animationLabel.position.copy(this.position).addScaledVector(up,2.4);
 }

}
