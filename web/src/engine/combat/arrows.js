import * as THREE from 'three';

// Arrows in flight. Each one follows the arc it was planned with and reports
// back once, when it arrives, so hitting is a matter of the release and not of
// anything the animal does afterwards.
const SHAFT=.8;

function buildArrow(){
 const group=new THREE.Group();
 const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,SHAFT,5),
  new THREE.MeshBasicMaterial({color:0x8a6a45}));
 shaft.rotation.x=Math.PI/2; // the cylinder runs on +Y; an arrow points down +Z.
 group.add(shaft);
 const head=new THREE.Mesh(new THREE.ConeGeometry(.045,.14,5),
  new THREE.MeshBasicMaterial({color:0xc9d2da}));
 head.rotation.x=Math.PI/2;head.position.z=SHAFT/2+.07;
 group.add(head);
 const fletching=new THREE.Mesh(new THREE.PlaneGeometry(.13,.16),
  new THREE.MeshBasicMaterial({color:0xd9d2c3,side:THREE.DoubleSide}));
 fletching.position.z=-SHAFT/2+.08;
 group.add(fletching);
 return group;
}

function discard(mesh){
 mesh.traverse?.(part=>{
  part.geometry?.dispose?.();
  part.material?.dispose?.();
 });
}

export class ArrowSystem {
 constructor({root,onArrive=null}={}){
  this.root=root;this.onArrive=onArrive;this.live=[];
  this.forward=new THREE.Vector3();
 }
 get size(){return this.live.length;}
 fire(plan,targetId=null){
  if(!plan?.fired)return false;
  const mesh=buildArrow();
  const at=plan.pointAt(0);
  mesh.position.copy(at);
  this.forward.copy(plan.velocityAt(0));
  if(this.forward.lengthSq()>1e-9)mesh.lookAt(at.clone().add(this.forward));
  this.root?.add(mesh);
  this.live.push({plan,mesh,targetId,s:0});
  return true;
 }
 update(dt){
  for(let i=this.live.length-1;i>=0;i--){
   const arrow=this.live[i];
   arrow.s=Math.min(1,arrow.s+dt/Math.max(.001,arrow.plan.flight));
   const at=arrow.plan.pointAt(arrow.s);
   arrow.mesh.position.copy(at);
   this.forward.copy(arrow.plan.velocityAt(arrow.s));
   if(this.forward.lengthSq()>1e-9)arrow.mesh.lookAt(at.clone().add(this.forward));
   if(arrow.s<1)continue;
   this.drop(i);
   this.onArrive?.(arrow.plan,arrow.targetId);
  }
 }
 drop(index){
  const [arrow]=this.live.splice(index,1);
  if(!arrow)return null;
  this.root?.remove(arrow.mesh);
  discard(arrow.mesh);
  return arrow;
 }
 // Arrows belong to the shot, not to the world: leaving the area or dying takes
 // them with it.
 clear(){
  while(this.live.length)this.drop(this.live.length-1);
 }
}
