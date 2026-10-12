import * as THREE from 'three';
import {BiomePopulation} from './engine/biome-population.js';
import {withinSceneryRange} from './engine/scenery-visibility.js';

// All player/world mutations use stable IDs. Only Meadows is populated now.
export class TreeHarvestSystem {
 constructor(scene,player,height,radius,{shared=null,playerId='local-owner',camera=null}={}){
  Object.assign(this,{scene,player,height,radius,shared,playerId,camera});
  this.trees=[];this.wood=0;this.attackClock=0;this.logLength=4;
  this.root=new THREE.Group();scene.add(this.root);
  this.origin=player.position.clone().normalize();
  const reference=Math.abs(this.origin.z)<.9?new THREE.Vector3(0,0,1):new THREE.Vector3(0,1,0);
  this.east=new THREE.Vector3().crossVectors(this.origin,reference).normalize();
  this.north=new THREE.Vector3().crossVectors(this.east,this.origin).normalize();
  this.chunks=[0,1,2,3];this.nextSerial=new Map(this.chunks.map(chunk=>[chunk,256]));
  this.population=new BiomePopulation({biomeId:0,childCount:4,targets:{trees:18},tolerances:{trees:2}});
  this.trunkMaterial=new THREE.MeshStandardMaterial({color:0x705038,roughness:1});
  this.leafMaterial=new THREE.MeshStandardMaterial({color:0x315934,roughness:1,transparent:true});
  this.woodLabel=document.createElement('div');
  this.woodLabel.style.cssText='position:fixed;right:12px;bottom:12px;color:white;background:#0009;padding:8px;font:14px monospace;z-index:4;pointer-events:none';
  document.getElementById('app').append(this.woodLabel);
  this.showWood();
  this.populate();
 }
 showWood(){this.woodLabel.textContent='Logs: '+(this.shared?.getPlayer(this.playerId)?.logs||this.wood);}
 hash(n){let x=(n+0x9e3779b9)|0;x=Math.imul(x^(x>>>16),0x21f0aaad);x=Math.imul(x^(x>>>15),0x735a2d97);return ((x^(x>>>15))>>>0)/4294967296;}
 // Four 32m child areas surrounding the Meadows landing site.
 location(chunk,serial){
  const angle=6.283185307179586*this.hash(serial*13+chunk*317+11);
  const radial=7+13*this.hash(serial*47+chunk*911+19);
  const cx=chunk%2===0?-16:16,cy=chunk<2?-16:16;
  const x=cx+Math.cos(angle)*radial,y=cy+Math.sin(angle)*radial;
  const direction=this.origin.clone().addScaledVector(this.east,x/this.radius)
   .addScaledVector(this.north,y/this.radius).normalize();
  const elevation=this.height.height(direction);
  if(elevation<3)return null;
  return direction.multiplyScalar(this.radius+elevation);
 }
 makeTree(chunk,serial,position){
  const id='meadows:tree:'+chunk+':'+serial;
  const tree=new THREE.Group();tree.position.copy(position);
  const up=position.clone().normalize();
  tree.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),up);
  const visual=new THREE.Group();tree.add(visual);
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.24,.31,4,8),this.trunkMaterial);
  trunk.position.y=2;
  const foliage=new THREE.Mesh(new THREE.ConeGeometry(1.35,3.2,8),this.leafMaterial.clone());
  foliage.position.y=4.3;
  visual.add(trunk,foliage);this.root.add(tree);
  const saved=this.shared?.getEntity(id);
  const state=saved&&saved.state!=='standing'?'collected':'standing';
  tree.visible=state==='standing';
  const entry={id,chunk,serial,tree,visual,trunk,foliage,at:position,state,hits:0,progress:0,ownerId:null,respawnTime:0,bumpCooldown:0};
  this.trees.push(entry);
  return entry;
 }
 populate(){
  for(const chunk of this.chunks){
   let created=0,serial=0;
   while(created<this.population.quota('trees',chunk)&&serial<256){
    const at=this.location(chunk,serial);
    if(at&&at.distanceTo(this.player.position)>6){
     this.makeTree(chunk,serial,at);created++;
    }
    serial++;
   }
  }
  // Restore previously respawned instances from the world owner's save.
  for(const [id,saved] of this.shared?.entities||[]){
   if(!id.startsWith('meadows:tree:')||saved.state!=='standing'||saved.serial<256||!saved.position)continue;
   if(this.trees.some(t=>t.id===id))continue;
   this.makeTree(saved.chunk,saved.serial,new THREE.Vector3(...saved.position));
   this.nextSerial.set(saved.chunk,Math.max(this.nextSerial.get(saved.chunk)||256,saved.serial+1));
  }
 }
 hiddenFromPlayers(at){
  const players=this.shared?.players?.values()||[{position:this.player.position}];
  for(const player of players){
   const p=player.position;
   if(!p)continue;
   if(at.distanceTo(p)<18)return false;
   // Conservative camera exclusion: all nearby directions are rejected
   // when we cannot establish that the candidate is behind that player.
   if(player.id===this.playerId&&this.camera){
    const direction=at.clone().sub(this.camera.position);
    const dist=direction.length();
    if(dist<90&&direction.normalize().dot(this.camera.getWorldDirection(new THREE.Vector3()))>.05)return false;
   }else if(at.distanceTo(p)<90)return false;
  }
  return true;
 }
 // Solid standing trunks provide an impulse without causing an axe hit.
 bump(body,dt){
  if(!body)return;
  const position=body.getPosition(),velocity=body.getLinearVelocity();
  const p=new THREE.Vector3(position.x,position.y,position.z);
  for(const t of this.trees){
   if(t.state!=='standing')continue;
   t.bumpCooldown=Math.max(0,t.bumpCooldown-dt);
   const up=t.at.clone().normalize(),relative=p.clone().sub(t.at);
   const elevation=relative.dot(up);
   if(elevation<-.5||elevation>4.5)continue;
   const lateral=relative.addScaledVector(up,-elevation);
   const distance=lateral.length();
   if(distance>=.66||distance<.0001||t.bumpCooldown>0)continue;
   const normal=lateral.divideScalar(distance);
   const toward=velocity.x*normal.x+velocity.y*normal.y+velocity.z*normal.z;
   if(toward>=0)continue;
   const kick=Math.min(2,Math.max(.4,-toward*.35));
   body.setLinearVelocity({x:velocity.x+normal.x*(-toward+kick),
    y:velocity.y+normal.y*(-toward+kick),z:velocity.z+normal.z*(-toward+kick)});
   body.setAwake(true);
   body.knockback={x:normal.x*kick,y:normal.y*kick,z:normal.z*kick,remaining:.22};
   t.bumpCooldown=.25;
  }
 }
 fell(t,harvesterId){
  t.state='falling';t.progress=0;t.ownerId=harvesterId;
  this.shared?.setEntity(t.id,{state:'felled',ownerId:harvesterId,chunk:t.chunk,serial:t.serial});
 }
 update(dt,body=null){
  // Visibility is always centered on the avatar, never the camera.
  // Keep trees and their simulation alive outside the render range.
  for(const t of this.trees){
   const visible=withinSceneryRange(t.at,this.player.position);
   if(t.state==='standing'||t.state==='falling'||t.state==='fading')
    t.tree.visible=visible;
   if(t.state==='flying')t.trunk.visible=withinSceneryRange(t.trunk.position,this.player.position);
  }
  this.attackClock=Math.max(0,this.attackClock-dt);
  // Chopping remains a proximity/axe action; bumping is only impact feedback.
  if(this.shared?.getEquippedTool(this.playerId)==='axe' && this.attackClock===0){
   let nearest=null,distance=2.5;
   for(const t of this.trees){
    if(t.state!=='standing')continue;
    const d=t.at.distanceTo(this.player.position);
    if(d<distance){nearest=t;distance=d;}
   }
   if(nearest){
    this.attackClock=.6;this.player.showAnimation('Axe Attack');
    if(++nearest.hits>=2)this.fell(nearest,this.playerId);
   }
  }
  this.bump(body,dt);
  for(const t of this.trees){
   if(t.state==='falling'){
    t.progress=Math.min(1,t.progress+dt/1.1);
    t.visual.rotation.z=-Math.PI*.48*THREE.MathUtils.smoothstep(t.progress,0,1);
    if(t.progress>=1){t.state='fading';t.progress=0;}
   }else if(t.state==='fading'){
    t.progress=Math.min(1,t.progress+dt/.7);
    t.foliage.material.opacity=1-t.progress;
    if(t.progress>=1){
     t.state='flying';t.progress=0;t.foliage.visible=false;
     t.trunk.getWorldPosition(t.flightPosition=new THREE.Vector3());
     this.scene.add(t.trunk);
     t.trunk.position.copy(t.flightPosition);
     t.trunk.quaternion.copy(t.tree.quaternion).multiply(t.visual.quaternion);
     t.tree.visible=false;
    }
   }else if(t.state==='flying'){
    const owner=this.shared?.getPlayer(t.ownerId);
    const destination=owner?.position||this.player.position;
    if(!destination)continue;
    const target=new THREE.Vector3(destination.x,destination.y,destination.z);
    const delta=target.sub(t.trunk.position),distance=delta.length();
    const speed=8+Math.min(35,Math.max(0,30-distance));
    t.trunk.position.addScaledVector(delta,Math.min(1,speed*dt/Math.max(.001,distance)));
    t.trunk.scale.setScalar(Math.max(.03,Math.min(1,distance/8)));
    if(distance<.5){
     t.state='collected';this.scene.remove(t.trunk);
     if(this.shared)this.shared.awardLog(t.ownerId,1);
     else this.wood++;
     this.showWood();
     this.shared?.setEntity(t.id,{state:'collected',chunk:t.chunk,serial:t.serial});
     t.respawnTime=8;
    }
   }else if(t.state==='collected')t.respawnTime=Math.max(0,t.respawnTime-dt);
  }
  for(const chunk of this.chunks){
   const live=this.trees.filter(t=>t.chunk===chunk&&t.state!=='collected').length;
   if(!this.population.needsRespawn('trees',chunk,live))continue;
   const retired=this.trees.find(t=>t.chunk===chunk&&t.state==='collected'&&t.respawnTime===0);
   if(!retired)continue;
   for(let trial=0;trial<32;trial++){
    const serial=(this.nextSerial.get(chunk)||256)+trial;
    const at=this.location(chunk,serial);
    if(!at||!this.hiddenFromPlayers(at))continue;
    if(this.trees.some(t=>t.state!=='collected'&&t.at.distanceTo(at)<3))continue;
    // A harvested tree is never regenerated at its old location.
    this.makeTree(chunk,serial,at);
    this.nextSerial.set(chunk,serial+1);
    this.shared?.setEntity('meadows:tree:'+chunk+':'+serial,{state:'standing',chunk,serial,position:at.toArray()});
    break;
   }
  }
 }
}
