import * as THREE from 'three';
import {withinSceneryRange} from '../render/scenery-visibility.js';

// Fresh water you can drink from, standing where the ground meets sea level. A
// spring is a resource slot like any other — the same seeded id, the same zone
// streams it in — but nothing is taken from it: no yield, no state change, and it
// never leaves. The only thing that moves when it is used is the player's thirst.
const POOL_RADIUS=1.5;
const UP=new THREE.Vector3(0,1,0);
export class Springs {
 constructor({root,shared,player,playerId}){
  Object.assign(this,{root,shared,player,playerId});
  this.pools=new Map();
  this.time=0;
  this.waterGeometry=new THREE.CircleGeometry(1,20);
  this.waterMaterial=new THREE.MeshStandardMaterial({color:0x2f7fa8,roughness:.2,metalness:.1,transparent:true,opacity:.88});
  this.rimGeometry=new THREE.RingGeometry(1,1.16,20);
  this.rimMaterial=new THREE.MeshStandardMaterial({color:0x6d7a5a,roughness:1});
 }
 spawn(id,position){
  if(this.pools.has(id))return false;
  const saved=this.shared?.getEntity(id);
  if(saved&&saved.state!=='standing')return false;
  const up=position.clone().normalize();
  const group=new THREE.Group();
  group.position.copy(position).addScaledVector(up,.04);
  group.quaternion.setFromUnitVectors(UP,up);
  group.scale.setScalar(POOL_RADIUS);
  const rim=new THREE.Mesh(this.rimGeometry,this.rimMaterial);
  rim.rotation.x=-Math.PI/2;
  const water=new THREE.Mesh(this.waterGeometry,this.waterMaterial);
  water.rotation.x=-Math.PI/2;
  water.position.y=.012;
  group.add(rim,water);
  this.root.add(group);
  const pool={id,position:position.clone(),up,group,water,state:'standing',phase:this.pools.size*.7};
  this.pools.set(id,pool);
  // The instance, not a bare true: the world holds what the kind made.
  return pool;
 }
 unload(id){
  const pool=this.pools.get(id);
  if(!pool)return false;
  this.root.remove(pool.group);
  this.pools.delete(id);
  return true;
 }
 update(dt){
  this.time+=dt;
  for(const pool of this.pools.values()){
   const visible=withinSceneryRange(pool.position,this.player.position);
   pool.group.visible=visible;
   if(!visible)continue;
   // A slow swell, so the surface reads as water rather than a blue disc.
   pool.water.position.y=.012+Math.sin(this.time*1.3+pool.phase)*.008;
   pool.water.scale.setScalar(1+Math.sin(this.time*.9+pool.phase)*.012);
  }
 }
}
