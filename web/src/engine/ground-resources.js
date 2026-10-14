import * as THREE from 'three';
import {withinSceneryRange} from './scenery-visibility.js';

// Stick and stone follow exactly the same seeded biome spawn/unload contract as trees.
export class GroundResources {
 constructor({root,shared,player,playerId}){
  Object.assign(this,{root,shared,player,playerId});
  this.items=new Map();
  this.stickGeometry=new THREE.CylinderGeometry(.045,.065,.9,5);
  this.stickGeometry.rotateZ(Math.PI/2);
  this.stoneGeometry=new THREE.DodecahedronGeometry(.22,0);
  this.stickMaterial=new THREE.MeshStandardMaterial({color:0x795230,roughness:1});
  this.stoneMaterial=new THREE.MeshStandardMaterial({color:0x828484,roughness:1});
 }
 spawn(type,id,position){
  if(this.items.has(id))return false;
  const saved=this.shared?.getEntity(id);
  if(saved&&saved.state!=='standing')return false;
  const group=new THREE.Group();
  group.position.copy(position);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),position.clone().normalize());
  const mesh=new THREE.Mesh(type==='stick'?this.stickGeometry:this.stoneGeometry,
   type==='stick'?this.stickMaterial:this.stoneMaterial);
  mesh.position.y=type==='stick'?.09:.2;
  group.add(mesh);this.root.add(group);
  this.items.set(id,{id,type,position,group,state:'standing',progress:0});
  return true;
 }
 isBusy(id){return this.items.get(id)?.state==='flying';}
 unload(id){
  const item=this.items.get(id);if(!item||this.isBusy(id))return;
  this.root.remove(item.group);this.items.delete(id);
 }
 update(dt,body){
  const avatar=body?.getPosition();if(!avatar)return;
  const avatarPoint=new THREE.Vector3(avatar.x,avatar.y,avatar.z);
  for(const item of this.items.values()){
   if(item.state==='standing'){
    item.group.visible=withinSceneryRange(item.position,this.player.position);
    const up=item.position.clone().normalize();
    const delta=avatarPoint.clone().sub(item.position);
    const altitude=delta.dot(up);
    const lateral=delta.addScaledVector(up,-altitude).length();
    if(lateral>1.05||altitude<-.6||altitude>2.3)continue;
    item.state='flying';item.progress=0;
    this.shared?.setEntity(item.id,{state:'collected',ownerId:this.playerId});
   }else if(item.state==='flying'){
    const target=this.player.position.clone().addScaledVector(this.player.position.clone().normalize(),1);
    const delta=target.sub(item.group.position),distance=delta.length();
    item.group.position.addScaledVector(delta,Math.min(1,dt*22/Math.max(.001,distance)));
    item.group.scale.setScalar(Math.max(.05,Math.min(1,distance/3)));
    if(distance<.4){
     this.shared?.awardResource(this.playerId,item.type==='stick'?'sticks':'stones',1);
     this.root.remove(item.group);this.items.delete(item.id);
    }
   }
  }
 }
}
