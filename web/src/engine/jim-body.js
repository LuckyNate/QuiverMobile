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

// Jim's editable proportions and gait. Keep tuning in one place;
// the stepping controller and limb lengths are otherwise unchanged.
export const JIM_GAIT={
 torso:{lift:.04,upperLift:.035,headDrop:.035,pelvisY:-.08,chestY:.34,chestWidth:.40,chestHeight:.22,chestDepth:.25},
 walk:{hipYaw:.13,hipRoll:.055,hipShift:.036,shoulderYaw:.11,shoulderRoll:.038,bob:.012,
  // How far a walk step reaches, and how far behind the body it is allowed to
  // trail before the next step starts. Both scale with speed, so a faster walk
  // takes longer steps instead of the same short ones more often.
  reachPerSpeed:.22,minReach:.12,maxReach:.55,
  triggerFraction:.45,minTrigger:.05,maxTrigger:.28},
 run:{hipYaw:.19,hipRoll:.070,hipShift:.043,shoulderYaw:.15,shoulderRoll:.050,bob:.026,
  // Cadence is the primary run quantity: speed raises it, in cycles per second.
  // Step length then follows from speed/cadence, so a faster body takes longer
  // steps before it takes quicker ones.
  cadenceBase:1.2,cadenceSpeedGain:.05,cadenceMax:1.7,
  // Each contact covers this many metres of ground, from .45 m ahead of the
  // hips to the same distance behind them. The rest of the step is flight.
  contactMetres:.90,touchdownForward:.45,
  flightLiftBase:.05,flightLiftGain:.006,footLift:.21},
 // Step length grows with travel speed between these bounds; cadence follows
 // from the distance a step actually covers, so the feet never take fixed
 // short steps under a fast body. Everything here is safe to tune.
 step:{
  metresPerSpeed:.34,minMetres:.30,maxMetres:.80,
  runMinMetres:.55,runMaxMetres:2.20,
  minSeconds:.16,maxSeconds:.44,minCycles:1.0,maxCycles:2.8,
  // Run above this speed. Measured motion and the commanded speed are both
  // considered, so a stick push that physics cannot fully deliver still runs.
  runSpeed:3.2
 },
 poseResponse:12
};
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
  this.rest=0;this.restTarget=0;
  this.runPhase=0;this.runBlend=0;this.running=false;this.gaitSwing=0;
  this.flight=0;this.flightArc=0;
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
 // Sitting is a visual pose only; the Box3D capsule stays authoritative.
 setResting(enabled){this.restTarget=enabled?1:0;}
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
 // Contacts can be cleared by a teleport or a frame hitch; the run gait seeds
 // them from the current pose instead of assuming a previous stance exists.
 ensureFeet(){
  for(let i=0;i<2;i++){
   const c=this.feet[i];
   if(!c.world)c.world=this.desiredContact(i===0?-1:1,false,new THREE.Vector3());
  }
 }
 // Running uses a separate gait: brief world-locked contact and a longer
 // airborne swing. At high speed the capsule moves farther per stride than
 // the short legs can reach, so airborne feet follow the pelvis, not the ground.
 runGait(dt,speed){
  if(!this.running){
   this.running=true;
   this.runPhase=0;this.runBlend=0;
   this.ensureFeet();
   for(const c of this.feet){c.from=c.world.clone();c.runStance=false;c.swing=false;}
  }
  // Cadence is set by speed and stride length follows from it, so the feet
  // cover the ground the body actually travels instead of churning in place.
  const stepLength=this.runStepLength(speed);
  const frequency=THREE.MathUtils.clamp(speed/(2*stepLength),
   JIM_GAIT.step.minCycles,JIM_GAIT.step.maxCycles);
  this.runPhase=(this.runPhase+dt*frequency)%1;
  this.runBlend=Math.min(1,this.runBlend+dt*9);
  // Contact lasts for a fixed distance, so the planted foot passes from ahead
  // of the hips to behind them before it lifts. What remains is flight.
  const contactSeconds=THREE.MathUtils.clamp(JIM_GAIT.run.contactMetres/speed,.10,.24);
  const contactFraction=Math.min(.5,contactSeconds*frequency);
  const touchdownZ=Math.min(JIM_GAIT.run.touchdownForward,stepLength*.45);
  const trailingZ=touchdownZ-speed*contactSeconds;
  for(let i=0;i<2;i++){
   const c=this.feet[i],side=i===0?-1:1;
   const phase=(this.runPhase+i*.5)%1;
   if(phase<contactFraction){
    if(!c.runStance){
     c.to=this.ground(this.fromLocal(new THREE.Vector3(side*.16,FOOT_MIN_Y,touchdownZ)),.055);
     c.runStance=true;
    }
   }else{
    c.runStance=false;
    const t=(phase-contactFraction)/(1-contactFraction);
    const local=new THREE.Vector3(side*.16,FOOT_MIN_Y,
     mix(trailingZ,touchdownZ,fit(t)));
    // Airborne foot follows the body; the next touchdown is sampled ahead.
    const surfaceLocal=this.toLocal(this.ground(this.fromLocal(local),.055));
    local.y=Math.max(FOOT_MIN_Y,surfaceLocal.y)+
     Math.sin(Math.PI*t)*(JIM_GAIT.run.footLift+Math.min(.14,speed*.014));
    c.to=this.fromLocal(local);
   }
   c.world.copy(c.from).lerp(c.to,this.runBlend);
   if(this.runBlend===1)c.from.copy(c.world);
  }
  // Airborne share drives the pelvis arc, so the body leaves the ground between
  // contacts instead of sliding along at one fixed height.
  const airborne=!this.feet[0].runStance&&!this.feet[1].runStance;
  this.flight=mix(this.flight,airborne?1:0,1-Math.exp(-16*dt));
  this.flightArc=THREE.MathUtils.clamp(JIM_GAIT.run.flightLiftBase+speed*JIM_GAIT.run.flightLiftGain,.03,.11);
 }
 // Gait distances are driven by travel speed instead of a fixed step: faster
 // travel takes longer steps, and cadence follows from what a step covers.
 stepLength(speed){
  const s=JIM_GAIT.step;
  return THREE.MathUtils.clamp(speed*s.metresPerSpeed,s.minMetres,s.maxMetres);
 }
 runStepLength(speed){
  const s=JIM_GAIT.step,r=JIM_GAIT.run;
  const cadence=THREE.MathUtils.clamp(r.cadenceBase+speed*r.cadenceSpeedGain,1,r.cadenceMax);
  return THREE.MathUtils.clamp(speed/(2*cadence),s.runMinMetres,s.runMaxMetres);
 }
 stepSeconds(speed,length){
  const s=JIM_GAIT.step;
  return THREE.MathUtils.clamp(length/Math.max(speed,.35),s.minSeconds,s.maxSeconds);
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
   // Step length grows with speed; the trigger scales with it so a fast walk
   // takes long steps instead of many short ones.
   // The step must reach as far as the body travels while the foot is in the
   // air, otherwise a fast walk can only answer with cadence.
   const reach=THREE.MathUtils.clamp(speed*JIM_GAIT.walk.reachPerSpeed,
    JIM_GAIT.walk.minReach,JIM_GAIT.walk.maxReach);
   const trigger=THREE.MathUtils.clamp(reach*JIM_GAIT.walk.triggerFraction,
    JIM_GAIT.walk.minTrigger,JIM_GAIT.walk.maxTrigger);
   if(behind[chosen]<trigger)return;
   // Land one step ahead into the travel direction; stance feet stay planted.
   const ahead=reach;
   const stepLength=this.stepLength(speed);
   const landing=this.ground(targets[chosen].clone().addScaledVector(heading,ahead),.055);
   // A step takes as long as covering its own length at this speed.
   const duration=this.stepSeconds(speed,stepLength);
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
 // Anatomical torso response: pelvis turns with the stepping leg while
 // the shoulders counter-rotate and the center of mass shifts to support.
 renderBody(climb,dt){
  const p=this.parts,t=JIM_GAIT.torso;
  const active=this.feet.findIndex(foot=>foot.swing);
  const walkSignal=active<0?0:(active===0?1:-1)*
   Math.sin(Math.PI*Math.min(1,this.feet[active].time/this.feet[active].duration));
  const signal=this.running?Math.sin(this.runPhase*Math.PI*2):walkSignal;
  this.gaitSwing=mix(this.gaitSwing,signal,1-Math.exp(-JIM_GAIT.poseResponse*dt));
  const tuning=this.running?JIM_GAIT.run:JIM_GAIT.walk;
  const sway=this.gaitSwing*(1-.35*climb);
  const hipYaw=sway*tuning.hipYaw,hipRoll=sway*tuning.hipRoll;
  const shoulderYaw=-sway*tuning.shoulderYaw,shoulderRoll=-sway*tuning.shoulderRoll;
  const shift=sway*tuning.hipShift;
  const bob=this.running?tuning.bob+this.flight*this.flightArc:
   Math.abs(sway)*tuning.bob;

  const rest=this.rest;
  // Sitting drops the pelvis and folds the torso forward over the lap.
  const pelvis=new THREE.Vector3(shift,t.pelvisY-.06*climb+bob-.26*rest,.015*climb-.03*rest);
  const belly=new THREE.Vector3(shift*.45,.16-.15*climb+bob*.5-.17*rest,.07*climb+.04*rest);
  const chest=new THREE.Vector3(-shift*.25,t.chestY-.25*climb+bob*.35-.09*rest,.24*climb+.09*rest);
  const shoulder=chest.clone().add(new THREE.Vector3(0,.09-.01*rest,-.01*climb));
  const neck=shoulder.clone().add(new THREE.Vector3(0,.15-.05*rest-.03*climb,.05*climb));
  const head=neck.clone().add(new THREE.Vector3(0,.19-.11*rest-.035*climb,.05*climb));
  // Raise the entire articulated upper body together, including its IK roots.
  for(const joint of [pelvis,belly,chest,shoulder,neck,head])joint.y+=t.lift;
  // Raise the upper torso, shoulders and neck only; head and nose stay put.
  for(const joint of [chest,shoulder,neck])joint.y+=t.upperLift;
  head.y-=t.headDrop; // Nose follows the head; neck and torso remain unchanged.
  const hipRotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,hipYaw,hipRoll,'YXZ'));
  const shoulderRotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,shoulderYaw,shoulderRoll,'YXZ'));

  const halfPelvis=.09;
  segment(p.pelvis,pelvis.clone().addScaledVector(UP,-halfPelvis),
   pelvis.clone().addScaledVector(UP,halfPelvis),1);
  p.pelvis.scale.set(.36,.18,.25);
  p.pelvis.quaternion.multiply(hipRotation);

  segment(p.abdomen,belly,chest,1);
  p.abdomen.scale.set(.32,.28,.23);

  // Exact chest center and dimensions are adjustable without moving its joints.
  segment(p.chest,chest.clone().addScaledVector(UP,-.05),
   chest.clone().addScaledVector(UP,.05),1);
  p.chest.scale.set(t.chestWidth,t.chestHeight,t.chestDepth);
  p.chest.quaternion.multiply(shoulderRotation);
  segment(p.neck,shoulder,neck,.07);
  p.head.position.copy(head);
  p.nose.position.copy(head).add(new THREE.Vector3(0,-.018,.14));
  return {pelvis,shoulder,hipRotation,shoulderRotation};
 }
 renderLimbs(climb,torso){
  const p=this.parts;
  for(let i=0;i<2;i++){
   const side=i===0?-1:1;
   // Both limb roots inherit their parent's gait-driven rotation.
   const hip=torso.pelvis.clone().add(
    new THREE.Vector3(side*.16,-.03,0).applyQuaternion(torso.hipRotation));
   const shoulder=torso.shoulder.clone().add(
    new THREE.Vector3(side*.215,.01,0).applyQuaternion(torso.shoulderRotation));
   const groundFoot=this.toLocal(this.feet[i].world);
   // Seated: feet move forward so the knees bend in front of the body.
   groundFoot.z+=.34*this.rest;
   // Terrain still controls uphill clearance, but not extra downhill leg reach.
   groundFoot.y=Math.max(FOOT_MIN_Y,groundFoot.y+.06*this.rest);
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
   // Seated hands rest on the knees instead of hanging at the sides.
   handTarget.lerp(knee.clone().add(new THREE.Vector3(0,.03,.10)),this.rest);
   const armIK=solveTwoBone(shoulder,handTarget,UPPER_ARM,FOREARM,
    new THREE.Vector3(side*.7,-.24,-.5));
   const elbow=vec(armIK.joint),wrist=vec(armIK.end);
   segment(p.upperArm[i],shoulder,elbow,.064);
   segment(p.forearm[i],elbow,wrist,.052);
   p.elbow[i].position.copy(elbow);
   p.hand[i].position.copy(wrist);
  }
 }
 update(position,up,dt=1/60,commanded=0){
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
  this.rest=mix(this.rest,this.restTarget,1-Math.exp(-8*interval));
  const closeToGround=position.length()-groundHere<1.65;
  const footTargets=[-1,1].map(side=>this.desiredContact(side,false,travel));
  this.ensureFeet();
  const handTargets=[-1,1].map(side=>this.desiredContact(side,true,travel));
  if(!closeToGround){
   this.running=false;
   this.resetContacts();
   for(let i=0;i<2;i++)this.feet[i].world=this.fromLocal(new THREE.Vector3((i?1:-1)*.16,-.83,.02));
  }else if(Math.max(speed,commanded)>=JIM_GAIT.step.runSpeed){
   // Slopes keep the run gait: a walk cannot carry this speed, so uphill only
   // changes posture and stride, never the gait itself.
   this.runGait(interval,Math.max(speed,commanded));
  }else{
   if(this.running){this.running=false;this.resetContacts();}
   this.flight=mix(this.flight,0,1-Math.exp(-10*interval));
   this.gait(this.feet,footTargets,interval,up,speed,true,false,position,heading);
  }
  if(closeToGround&&this.climb>.2)this.gait(this.hands,handTargets,interval,up,speed,true,true);
  else for(let i=0;i<2;i++){this.hands[i].world=handTargets[i];this.hands[i].swing=false;}
  const torso=this.renderBody(this.climb,interval);
  this.renderLimbs(this.climb,torso);
 }
}
