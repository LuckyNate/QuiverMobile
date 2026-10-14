import * as THREE from 'three';
import {ResourceDensity} from './engine/resource-density.js';
import {ResourceDistributor} from './engine/resource-distributor.js';
import {withinSceneryRange} from './engine/scenery-visibility.js';
import {Tree} from './engine/tree.js';
import {ObjectRegistry} from './engine/object-registry.js';
import {TreeVisual} from './engine/tree-visual.js';
import {TreeContact} from './engine/tree-contact.js';
import {TreeLifecycle} from './engine/tree-lifecycle.js';
import {TreePopulation} from './engine/tree-population.js';

// All player/world mutations use stable IDs. Only Meadows is populated now.
export class TreeHarvestSystem {
 constructor(scene,player,height,radius,{shared=null,playerId='local-owner',camera=null}={}){
  Object.assign(this,{scene,player,height,radius,shared,playerId,camera});
  this.trees=[];this.objects=new ObjectRegistry();this.wood=0;this.attackClock=0;this.logLength=4;
  this.renderEnabled=true;
  this.root=new THREE.Group();scene.add(this.root);
  this.origin=player.position.clone().normalize();
  const reference=Math.abs(this.origin.z)<.9?new THREE.Vector3(0,0,1):new THREE.Vector3(0,1,0);
  this.east=new THREE.Vector3().crossVectors(this.origin,reference).normalize();
  this.north=new THREE.Vector3().crossVectors(this.east,this.origin).normalize();
  this.chunks=[0,1,2,3];this.nextSerial=new Map(this.chunks.map(chunk=>[chunk,256]));
  this.density=new ResourceDensity({seed:shared?.seed||'QuiverGL'});
  this.distributor=new ResourceDistributor(this.density);
  this.targetByChunk=new Map();
  this.treePopulation=new TreePopulation(this);
  this.trunkMaterial=new THREE.MeshStandardMaterial({color:0x705038,roughness:1});
  this.leafMaterial=new THREE.MeshStandardMaterial({color:0x315934,roughness:1,transparent:true});
  this.treeVisual=new TreeVisual(this.trunkMaterial,this.leafMaterial);
  this.lifecycle=new TreeLifecycle({scene,shared,player,onLocalLog:()=>{this.wood++;}});
  this.contact=new TreeContact({
   getTool:()=>this.shared?.getEquippedTool(this.playerId)||null,
   onHit:t=>{
    if(this.attackClock>0)return;
    this.attackClock=.6;this.player.showAnimation('Axe Attack');
    if(++t.hits>=2)this.fell(t,this.playerId);
   }
  });
  this.populate();
 }
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
  const {tree,visual,trunk,foliage}=this.treeVisual.create(position);
  this.root.add(tree);
  const saved=this.shared?.getEntity(id);
  const state=saved&&saved.state!=='standing'?'collected':'standing';
  tree.visible=state==='standing';
  const object=this.objects.add(new Tree({id,position:position.toArray(),state}));
  const entry={id,object,chunk,serial,tree,visual,trunk,foliage,at:position,state,hits:0,progress:0,ownerId:null,respawnTime:0,bumpCooldown:0};
  this.trees.push(entry);
  return entry;
 }
 populate(){this.treePopulation.populate();}
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
 // Touching a standing trunk or branch pushes back; with the axe equipped, impact chops.
 bump(body,dt){this.contact.update(this.trees,body,dt);}
  fell(t,harvesterId){
  t.state='falling';t.object.state='falling';t.progress=0;t.ownerId=harvesterId;
  this.shared?.setEntity(t.id,{state:'felled',ownerId:harvesterId,chunk:t.chunk,serial:t.serial});
 }
 update(dt,body=null){
  // Visibility is always centered on the avatar, never the camera.
  // Keep trees and their simulation alive outside the render range.
  for(const t of this.trees){
   const visible=withinSceneryRange(t.at,this.player.position);
   if(t.state==='standing'||t.state==='falling'||t.state==='fading')
    t.tree.visible=this.renderEnabled&&visible;
   if(t.state==='flying')t.trunk.visible=this.renderEnabled&&withinSceneryRange(t.trunk.position,this.player.position);
  }
  this.attackClock=Math.max(0,this.attackClock-dt);
  this.bump(body,dt);
  this.lifecycle.update(this.trees,dt);
  this.treePopulation.respawn();
 }
}
