import * as THREE from 'three';
import {solveTwoBone} from './two-bone-ik.js';

// Jim's articulated-body layout and procedural two-bone limb solver.
// The original Box3D capsule remains authoritative for position and contacts;
// these planted supports are animation targets, never collision bodies.
const UP=new THREE.Vector3(0,1,0);
const fit=(t)=>t*t*(3-2*t);
const mix=(a,b,t)=>a+(b-a)*t;
// Limb lengths proportioned for the 1.8 m Box3D collision capsule.
const THIGH=.40,SHIN=.40,UPPER_ARM=.34,FOREARM=.32;
// Limit the ankle so the visible sole stays inside the capsule's bottom.
const FOOT_MIN_Y=-.86; // ankle + .025 visual offset - .045 sole = -.88.
function material(color){return new THREE.MeshStandardMaterial({color,roughness:.86,flatShading:true});}
function box(parent,color){
 const m=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material(color));
 parent.add(m);return m;
}
function bone(parent,color){
 const m=new THREE.Mesh(new THREE.CylinderGeometry(1,1,1,6),material(color));
 parent.add(m);return m;
}
function sphere(parent,color,r){
 const m=new THREE.Mesh(new THREE.SphereGeometry(r,8,6),material(color));
 parent.add(m);return m;
}
function segment(mesh,a,b,width){
 const v=b.clone().sub(a),len=v.length();
 mesh.position.copy(a).addScaledVector(v,.5);
 mesh.quaternion.setFromUnitVectors(UP,len>1e-6?v.multiplyScalar(1/len):UP);
 mesh.scale.set(width,Math.max(.001,len),width);
}
const vec=v=>new THREE.Vector3(v.x,v.y,v.z);
function support(side){
 return {side,world:null,from:null,to:null,time:0,duration:.32,lift:.17,swing:false};
}

export class JimBody {
 constructor(root){
  this.root=root;
  this.visual=new THREE.Group();
  root.add(this.visual);
  this.height=null;this.radius=0;
  this.prevPosition=null;this.stepNext=0;this.handNext=0;this.climb=0;
  this.feet=[support(-1),support(1)];
  this.hands=[support(-1),support(1)];
  this.parts={
   pelvis:box(this.visual,0x3b90b4),
   abdomen:box(this.visual,0x4aa9c3),
   chest:box(this.visual,0x438bad),
   neck:bone(this.visual,0x8798a0),
   head:sphere(this.visual,0xd7b782,.125),
   nose:box(this.visual,0xb18f72),
   thigh:[bone(this.visual,0x358cb2),bone(this.visual,0x568c9e)],
   shin:[bone(this.visual,0x287e9d),bone(this.visual,0x447b8a)],
   upperArm:[bone(this.visual,0x5b9da0),bone(this.visual,0x667f9b)],
   forearm:[bone(this.visual,0x438e90),bone(this.visual,0x536b87)],
   foot:[box(this.visual,0x3f606c),box(this.visual,0x3f606c)],
   hand:[box(this.visual,0xbaa98b),box(this.visual,0xbaa98b)],
   knee:[sphere(this.visual,0x667581,.047),sphere(this.visual,0x667581,.047)],
   elbow:[sphere(this.visual,0x77818a,.045),sphere(this.visual,0x77818a,.045)]
  };
  for(const foot of this.parts.foot)foot.scale.set(.17,.09,.29);
  for(const hand of this.parts.hand)hand.scale.set(.13,.095,.16);
  this.parts.nose.scale.set(.058,.055,.055);
 }
 setTerrain(height,radius){this.height=height;this.radius=radius;}
 // Use the same procedural surface as rendering and collision. World radial
 // projection works across all D20 faces and respects changing local gravity.
 ground(worldPoint,clearance=.06){
  if(!this.height)return worldPoint.clone();
  const dir=worldPoint.clone().normalize();
  return dir.multiplyScalar(this.height.radius(dir,this.radius)+clearance);
 }
 fromLocal(local){return this.root.localToWorld(local.clone());}
 toLocal(world){return this.root.worldToLocal(world.clone());}
 desiredContact(side,isHand,travel){
  const local=isHand
   ?new THREE.Vector3(side*.29,-.40,.48)
   :new THREE.Vector3(side*.16,-.84,.06);
  const advance=isHand?.11:.18;
  local.addScaledVector(travel,advance);
  return this.ground(this.fromLocal(local),isHand?.055:.055);
 }
 resetContacts(){
  for(const c of [...this.feet,...this.hands]){
   c.world=null;c.from=null;c.to=null;c.swing=false;c.time=0;
  }
 }
 // Contact targets remain in WORLD SPACE during stance. Only the swinging
 // support moves, so the planted foot cannot slide along with the capsule.
 advanceSupport(c,dt,up){
  if(!c.swing)return;
  c.time+=dt;
  const t=Math.min(1,c.time/c.duration),s=fit(t);
  c.world.copy(c.from).lerp(c.to,s).addScaledVector(up,Math.sin(Math.PI*t)*c.lift);
  if(t>=1){c.world.copy(c.to);c.swing=false;}
 }
 startSupport(c,target,up,duration){
  c.from=c.world.clone();c.to=target.clone();c.time=0;
  c.duration=duration;c.swing=true;
  const middle=c.from.clone().lerp(c.to,.5);
  const rise=this.height?Math.max(0,this.ground(middle).length()-middle.length()):0;
  c.lift=.14+Math.min(.5,rise);
 }
 gait(group,targets,dt,up,speed,enabled,isHand=false,position=null,heading=null){
  for(let i=0;i<2;i++){
   const c=group[i];
   if(!c.world)c.world=targets[i].clone();
   this.advanceSupport(c,dt,up);
  }
  if(!enabled||speed<.18||group.some(c=>c.swing))return;
  if(!isHand&&position&&heading){
   // Predict center-of-balance movement relative to planted supports.
   // A trailing foot must begin its swing BEFORE the torso passes over it.
   const lookahead=Math.min(.24,speed*.045);
   const balance=this.ground(position).addScaledVector(heading,lookahead);
   const behind=group.map(c=>balance.clone().sub(c.world).dot(heading));
   const next=this.stepNext;
   const chosen=behind[next]>=behind[1-next]-.12?next:1-next;
   if(behind[chosen]<.065)return;
   // Advance landing target into travel direction; stance feet remain planted.
   const ahead=Math.min(.23,.10+speed*.018);
   const landing=this.ground(targets[chosen].clone().addScaledVector(heading,ahead),.055);
   // Never spend 0.19 seconds airborne at 10 m/s with 0.8 m legs.
   const duration=THREE.MathUtils.clamp(.40/Math.max(speed,.8),.03,.24);
   this.startSupport(group[chosen],landing,up,duration);
   this.stepNext=1-chosen;
   return;
  }
  // Scrambling hands preserve their independently alternating contacts.
  const last=this.handNext;
  const errors=group.map((c,i)=>c.world.distanceTo(targets[i]));
  const chosen=errors[last]>.26?last:errors[0]>errors[1]?0:1;
  if(errors[chosen]<=.31)return;
  this.startSupport(group[chosen],targets[chosen],up,
   THREE.MathUtils.clamp(.38-speed*.015,.19,.40));
  this.handNext=1-chosen;
 }
 renderBody(climb){
  const p=this.parts;
  const pelvis=new THREE.Vector3(0,-.14-.06*climb,.015*climb);
  const belly=new THREE.Vector3(0,.19-.18*climb,.055*climb);
  const chest=new THREE.Vector3(0,.43-.39*climb,.29*climb);
  const neck=new THREE.Vector3(0,.63-.33*climb,.34*climb);
  const head=new THREE.Vector3(0,.78-.35*climb,.38*climb);
  segment(p.neck,chest,neck,.07);
  for(const [mesh,a,b,scale] of [
   [p.pelvis,pelvis,new THREE.Vector3(0,.06-.1*climb,.02*climb),[.36,.18,.25]],
   [p.abdomen,belly,chest,[.32,.30,.23]],
   [p.chest,chest,new THREE.Vector3(0,.55-.17*climb,.2*climb),[.48,.26,.29]]
  ]){
   segment(mesh,a,b,1); // orient the torso segment to its local spine axis.
   mesh.scale.set(...scale);
  }
  p.head.position.copy(head);
  p.nose.position.copy(head).add(new THREE.Vector3(0,-.018,.14));
  return {pelvis,chest};
 }
 renderLimbs(climb,torso){
  const p=this.parts;
  for(let i=0;i<2;i++){
   const side=i===0?-1:1;
   const hip=torso.pelvis.clone().add(new THREE.Vector3(side*.16,-.03,0));
   const shoulder=torso.chest.clone().add(new THREE.Vector3(side*.26,.01,0));
   const groundFoot=this.toLocal(this.feet[i].world);
   // Terrain still controls uphill clearance, but not extra downhill leg reach.
   groundFoot.y=Math.max(FOOT_MIN_Y,groundFoot.y);
   const footIK=solveTwoBone(hip,groundFoot,THIGH,SHIN,
    new THREE.Vector3(side*.2,.10,.9));
   const knee=vec(footIK.joint),ankle=vec(footIK.end);
   segment(p.thigh[i],hip,knee,.076);
   segment(p.shin[i],knee,ankle,.060);
   p.knee[i].position.copy(knee);
   p.foot[i].position.copy(ankle).add(new THREE.Vector3(0,.025,.065));

   const relaxedHand=new THREE.Vector3(side*.36,-.07,.025);
   const climbHand=this.toLocal(this.hands[i].world);
   const handTarget=relaxedHand.lerp(climbHand,climb);
   const armIK=solveTwoBone(shoulder,handTarget,UPPER_ARM,FOREARM,
    new THREE.Vector3(side*.7,-.24,-.5));
   const elbow=vec(armIK.joint),wrist=vec(armIK.end);
   segment(p.upperArm[i],shoulder,elbow,.064);
   segment(p.forearm[i],elbow,wrist,.052);
   p.elbow[i].position.copy(elbow);
   p.hand[i].position.copy(wrist);
  }
 }
 update(position,up,dt=1/60){
  if(!this.height||dt<=0)return;
  const interval=Math.max(1/120,Math.min(dt,.06));
  this.root.updateMatrixWorld(true);
  let delta=new THREE.Vector3();
  if(this.prevPosition)delta.copy(position).sub(this.prevPosition);
  if(!this.prevPosition||delta.length()>2.5){delta.set(0,0,0);this.resetContacts();}
  this.prevPosition=position.clone();
  const horizontal=delta.addScaledVector(up,-delta.dot(up));
  const speed=Math.min(12,horizontal.length()/interval);
  const heading=horizontal.lengthSq()>1e-8?horizontal.clone().normalize():null;
  const moveLocal=horizontal.applyQuaternion(this.root.quaternion.clone().invert());
  const travel=moveLocal.length()>1e-5?moveLocal.normalize().multiplyScalar(Math.min(.45,speed*.09)):
   new THREE.Vector3();

  const groundHere=this.height.radius(up,this.radius);
  const ahead=this.fromLocal(new THREE.Vector3(travel.x,0,.65+travel.z));
  const dirAhead=ahead.normalize();
  const groundAhead=this.height.radius(dirAhead,this.radius);
  const grade=(groundAhead-groundHere)/Math.max(.3,.65+travel.z);
  const climbTarget=speed>.16?THREE.MathUtils.smoothstep(grade,.48,1.55):0;
  this.climb=mix(this.climb,climbTarget,1-Math.exp(-6*interval));
  const closeToGround=position.length()-groundHere<1.65;
  const footTargets=[-1,1].map(side=>this.desiredContact(side,false,travel));
  const handTargets=[-1,1].map(side=>this.desiredContact(side,true,travel));
  if(!closeToGround){
   this.resetContacts();
   for(let i=0;i<2;i++)this.feet[i].world=this.fromLocal(new THREE.Vector3((i?1:-1)*.16,-.83,.02));
  }else this.gait(this.feet,footTargets,interval,up,speed,true,false,position,heading);
  if(closeToGround&&this.climb>.2)this.gait(this.hands,handTargets,interval,up,speed,true,true);
  else for(let i=0;i<2;i++){this.hands[i].world=handTargets[i];this.hands[i].swing=false;}
  const torso=this.renderBody(this.climb);
  this.renderLimbs(this.climb,torso);
 }
}
