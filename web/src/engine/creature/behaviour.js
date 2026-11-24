import * as THREE from 'three';

const UP=new THREE.Vector3(0,1,0);
// Senses are the same shape for every species; a module only tunes the numbers.
// Earshot is a sphere, eyeshot is a cone in front, `lose` is where interest ends.
export const SENSES=Object.freeze({earshot:12,eyeshot:14,halfAngle:Math.PI/3,lose:22});

// The tangent frame the instanced art already uses: a creature's nose is local
// +x, and the minimal rotation that stands it upright decides where that points.
export function surfaceFrame(position){
 const up=position.clone().normalize();
 const upright=new THREE.Quaternion().setFromUnitVectors(UP,up);
 const nose=new THREE.Vector3(1,0,0).applyQuaternion(upright);
 nose.addScaledVector(up,-nose.dot(up)).normalize();
 return {up,nose};
}
// A tangent heading to the scalar yaw the art expects, measured about `up`.
export function yawFor(position,heading){
 if(!heading)return 0;
 const {up,nose}=surfaceFrame(position);
 return Math.atan2(new THREE.Vector3().crossVectors(nose,heading).dot(up),nose.dot(heading));
}
// A tangent direction, `angle` radians clockwise from the creature's nose.
export function tangentAt(position,angle=0){
 const {up,nose}=surfaceFrame(position);
 const east=new THREE.Vector3().crossVectors(up,nose).normalize();
 return nose.multiplyScalar(Math.cos(angle)).addScaledVector(east,Math.sin(angle)).normalize();
}

// Behaviour runs one clock for every creature: senses, a small state machine and
// walking on the planet. A species module supplies its tuning and its transitions.
export class CreatureBehaviour {
 constructor({senses={}}={}){this.senses=Object.freeze({...SENSES,...senses});}
 enter(creature,state){
  if(creature.state===state)return false;
  creature.state=state;
  creature.stateTime=0;
  return true;
 }
 // Earshot or eyeshot is enough to notice; distance is returned when it does.
 spotted(creature,player){
  if(!player)return null;
  const toPlayer=player.clone().sub(creature.at);
  const distance=toPlayer.length();
  if(distance<=this.senses.earshot)return distance;
  if(distance>this.senses.eyeshot||!creature.heading)return null;
  return creature.heading.dot(toPlayer.normalize())>=Math.cos(this.senses.halfAngle)?distance:null;
 }
 lost(creature,player){return !player||creature.at.distanceTo(player)>this.senses.lose;}
 // Walk `distance` metres along the surface without leaving it.
 step(creature,direction,distance,{height,radius}){
  const up=creature.at.clone().normalize();
  const tangent=direction.clone().addScaledVector(up,-direction.dot(up));
  if(distance<=0)return 0;
  if(tangent.lengthSq()<1e-9)return 0;
  tangent.normalize();
  const next=creature.at.clone().addScaledVector(tangent,distance).normalize();
  creature.at.copy(next.multiplyScalar(radius+height.height(next)));
  // Keep the heading tangent to the ground under the new position.
  const newUp=creature.at.clone().normalize();
  creature.heading=tangent.addScaledVector(newUp,-tangent.dot(newUp)).normalize();
  return distance;
 }
 face(creature,point){
  const up=creature.at.clone().normalize();
  const facing=point.clone().sub(creature.at);
  const tangent=facing.addScaledVector(up,-facing.dot(up));
  if(tangent.lengthSq()<1e-9)return false;
  creature.heading=tangent.normalize();
  return true;
 }
 arrived(creature,point,within){return creature.at.distanceTo(point)<=within;}
 think(_creature,_dt,_context){}
}
