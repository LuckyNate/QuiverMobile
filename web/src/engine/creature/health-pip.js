import * as THREE from 'three';

// A small health bar that floats over a creature's head. It is real geometry in
// the world, but it only turns about the local up axis, so it always reads to the
// camera without rolling over into the ground.
const BAR_WIDTH=.46,BAR_HEIGHT=.055;
const BACK_WIDTH=.5,BACK_HEIGHT=.085;
export class HealthPips {
 constructor({root,camera,lift=1.35,fill=0xd23c3c}={}){
  this.root=root;this.camera=camera;this.lift=lift;
  this.backGeometry=new THREE.PlaneGeometry(BACK_WIDTH,BACK_HEIGHT);
  this.fillGeometry=new THREE.PlaneGeometry(BAR_WIDTH,BAR_HEIGHT);
  this.backMaterial=new THREE.MeshBasicMaterial({color:0x101418,depthWrite:false});
  this.fillMaterial=new THREE.MeshBasicMaterial({color:fill,depthWrite:false});
  this.items=new Map();
  this.forward=new THREE.Vector3();
  this.xAxis=new THREE.Vector3();
  this.basis=new THREE.Matrix4();
 }
 // `fraction` is health over max health; the bar shrinks from the right edge so
 // the filled part stays anchored to the left.
 show(id,position,fraction){
  let item=this.items.get(id);
  if(!item){
   const group=new THREE.Group();
   group.add(new THREE.Mesh(this.backGeometry,this.backMaterial));
   const fill=new THREE.Mesh(this.fillGeometry,this.fillMaterial);
   fill.position.z=.002;
   group.add(fill);
   this.root.add(group);
   item={group,fill,up:new THREE.Vector3(),position:new THREE.Vector3()};
   this.items.set(id,item);
  }
  const share=Math.max(0,Math.min(1,Number(fraction)||0));
  item.fill.scale.x=share;
  item.fill.position.x=-(1-share)*BAR_WIDTH/2;
  item.up.copy(position).normalize();
  item.position.copy(position);
  item.group.position.copy(position).addScaledVector(item.up,this.lift);
  item.group.visible=true;
  this.oriented(item);
  return true;
 }
 // Yaw only, about the creature's own up: the bar's top stays the sky's top.
 oriented(item){
  if(!this.camera)return;
  this.forward.copy(this.camera.position).sub(item.group.position);
  this.forward.addScaledVector(item.up,-this.forward.dot(item.up));
  if(this.forward.lengthSq()<1e-9)return;
  this.forward.normalize();
  this.xAxis.copy(item.up).cross(this.forward).normalize();
  this.basis.makeBasis(this.xAxis,item.up,this.forward);
  item.group.quaternion.setFromRotationMatrix(this.basis);
 }
 hide(id){
  const item=this.items.get(id);
  if(item)item.group.visible=false;
  return Boolean(item);
 }
 remove(id){
  const item=this.items.get(id);
  if(!item)return false;
  this.root.remove(item.group);
  this.items.delete(id);
  return true;
 }
 // The camera moves every frame; the bars turn to follow it.
 update(){
  for(const item of this.items.values())if(item.group.visible)this.oriented(item);
 }
}
