import * as THREE from 'three';
import {TreeHarvestSystem,TREE_CROWN_METERS} from '../flora/trees.js';
import {Biome} from '../biome/biome.js';
import {PopulationZone} from '../population/population-zone.js';
import {SpawnRegistry} from '../population/spawn-registry.js';
import {ResourceDensity} from '../biome/resource-density.js';
import {ResourceDistributor} from '../biome/resource-distributor.js';
import {TallGrassField} from '../flora/tall-grass.js';
import {GroundResources} from './ground-resources.js';
import {CreatureSystem} from '../creature/creature-system.js';
import {WORLD_SETUP,BIOME_SETUP} from '../world/world-config.js';

// How close the avatar has to stand to work a carcass with a knife.
const CARCASS_REACH=1.6;

// One density profile per face. The biome table is the only place that says how
// many of a type a cell holds, resources and creatures alike.
function densityProfiles(setup){
 const profiles={};
 for(const conf of setup)profiles['F'+String(conf.id).padStart(2,'0')]={...conf.resources,...conf.creatures};
 return profiles;
}

// Biomes request inhabitants near the avatar. This owns the live spawn bridge;
// TreeHarvestSystem keeps its existing visuals, contact, collection and Box3D adapter.
export class ResourceHandler extends TreeHarvestSystem {
 constructor(scene,player,height,radius,{terrain,shared=null,playerId='local-owner',camera=null,onPlayerDamage=null}={}){
  super(scene,player,height,radius,{shared,playerId,camera,autoPopulate:false});
  if(!terrain?.roots?.length)throw new Error('ResourceHandler requires read-only D20 biome roots');
  this.chunks=[]; // Disable the old four-cell Meadows-only population loop.
  this.entryById=new Map();
  this.tapTarget=null; // {type,id} of a tapped tree or clump, gathered on arrival.
  this.typeById=new Map();
  this.spawns=new SpawnRegistry();
  this.grass=new TallGrassField({root:this.root,shared,player,playerId});
  this.grass.onDiscovery=()=>this.onDyeDiscovery?.();
  this.ground=new GroundResources({root:this.root,shared,player,playerId});
  // Enemies live in their own system: species modules own behaviour and combat,
  // while the spawn registry only knows this is a creature kind.
  this.creatures=new CreatureSystem({root:this.root,shared,player,playerId,height,radius,camera,
   onPlayerDamage});
  // Each kind names the adapter that owns its live objects, the category it
  // belongs to, and how long a removed one waits before its cell may put it back.
  // A creature registers beside a resource without pretending to be one.
  this.spawns.register({type:'tree',category:'resource',respawnSeconds:8,adapter:{
   spawn:(id,position,context)=>{
    // A collected tree keeps its entry until the cell is evicted; retire it so the
    // same seeded slot can stand again.
    if(this.findTree(id)?.state==='collected')this.unloadTree(id);
    return this.spawnTree(id,position,context?.cellKey);
   },
   unload:id=>this.unloadTree(id),
   alive:id=>{
    const tree=this.findTree(id);
    return Boolean(tree)&&tree.state!=='collected';
   },
   busy:id=>['falling','fading','flying'].includes(this.findTree(id)?.state)
  }});
  this.spawns.register({type:'grass',category:'resource',respawnSeconds:25,adapter:{
   spawn:(id,position,context)=>this.grass.spawn(id,position,context?.biome),
   unload:id=>this.grass.unload(id),
   alive:id=>Boolean(this.grass.clumps.get(id)),
   busy:id=>['falling','flying'].includes(this.grass.clumps.get(id)?.state)
  }});
  for(const type of ['stick','stone'])this.spawns.register({type,category:'resource',respawnSeconds:20,adapter:{
   spawn:(id,position)=>this.ground.spawn(type,id,position),
   unload:id=>this.ground.unload(id),
   alive:id=>this.ground.items.has(id),
   busy:id=>this.ground.isBusy(id)
  }});
  this.spawns.register({type:'boar',category:'creature',respawnSeconds:60,adapter:{
   spawn:(id,position)=>this.creatures.spawn('boar',id,position),
   unload:id=>this.creatures.unload(id),
   alive:id=>this.creatures.has(id)
  }});
  // One density table and one distributor serve every face; the seed decides all.
  this.density=new ResourceDensity({seed:shared?.seed||'QuiverGL',profiles:densityProfiles(BIOME_SETUP)});
  this.distributor=new ResourceDistributor(this.density);
  this.zones=terrain.roots.map(root=>{
   const id=Number(root.address.slice(1,3));
   const conf=BIOME_SETUP[id];
   const biome=new Biome({id,name:conf.name,grassStyle:conf.grassStyle,
    resources:conf.resources,creatures:conf.creatures,tolerances:conf.tolerances});
   return new PopulationZone({biome,root,radius,height,host:this,cellSize:WORLD_SETUP.resourceCellMeters,
    distributor:this.distributor});
  });
  this.terrain=terrain;
 }
 // The kinds this face asks for, in table order. Anything a face names but no
 // adapter registered is skipped rather than spawned half-alive.
 kindsIn(biome){
  const kinds=[];
  for(const type of biome.types()){
   const kind=this.spawns.get(type);
   if(kind&&biome.density(type)>0)kinds.push(kind);
  }
  return kinds;
 }
 canSpawn(type){return this.spawns.canSpawn(type);}
 inTransition(id){return this.spawns.isBusy(this.typeById.get(id),id);}
 spawn(type,id,position,context){
  const spawned=this.spawns.spawn(type,id,position,context);
  if(spawned)this.typeById.set(id,type);
  return spawned;
 }
 unload(id){
  const type=this.typeById.get(id);
  if(!type)return;
  this.spawns.unload(type,id);
  this.typeById.delete(id);
 }
 // The live half of the zone's contract. Deadlines are written to the shared
 // world, so a cell that comes back into range remembers what is still regrowing.
 kind(type){return this.spawns.get(type);}
 alive(type,id){
  const kind=this.spawns.get(type);
  return kind?kind.alive(id):false;
 }
 removedAt(id){
  const at=this.shared?.getEntity(id)?.respawnAt;
  return Number.isFinite(at)?at:null;
 }
 noteRemoved(id,at){
  if(!this.shared)return;
  const saved=this.shared.getEntity(id)||{};
  this.shared.setEntity(id,{...saved,state:'collected',respawnAt:at});
 }
 respawn(type,id,position,context){
  const saved=this.shared?.getEntity(id);
  if(saved)this.shared.setEntity(id,{...saved,state:'standing',respawnAt:0});
  return this.spawn(type,id,position,context);
 }
 spawnTree(id,position,chunk){
  if(this.entryById.has(id))return false;
  const record=this.shared?.getEntity(id);
  if(record&&record.state!=='standing')return false;
  const entry=this.makeTree(chunk,0,this.spacedPosition(id,position),id);
  this.entryById.set(id,entry);
  return true;
 }
 // Does a trunk at this spot clear every pine already standing? One crown's radius
 // plus the other's is the closest the two may come; the shave keeps exact contact
 // from reading as an overlap through rounding.
 clearOf(crown,at){
  for(const other of this.trees){
   if(other.state==='collected')continue;
   const gap=crown+TREE_CROWN_METERS*other.scale;
   if(other.at.distanceToSquared(at)<gap*gap*.999)return false;
  }
  return true;
 }
 // Pines respect each other by moving, not by vanishing: a candidate that lands
 // inside another tree's crown is pushed along the gap between the two until both
 // fit, then dropped back onto the ground at its new spot. Eight passes settle
 // almost every tree; the rest step onto the nearest clear ground on a ring around
 // the spot they could not hold, so the wood keeps every tree it was seeded with.
 // All of this happens once, while the tree is being generated.
 spacedPosition(id,position){
  const at=position.clone();
  const crown=TREE_CROWN_METERS*this.sizeOf(id).scale;
  for(let pass=0;pass<8;pass++){
   let moved=false;
   for(const other of this.trees){
    if(other.state==='collected')continue;
    const gap=crown+TREE_CROWN_METERS*other.scale;
    const dx=at.x-other.at.x,dy=at.y-other.at.y,dz=at.z-other.at.z;
    const distanceSq=dx*dx+dy*dy+dz*dz;
    if(distanceSq>=gap*gap)continue;
    const distance=Math.sqrt(distanceSq);
    if(distance<1e-3){
     // Exactly on top of the other trunk: step off along the surface tangent.
     const axis=Math.abs(at.y)<.9?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0);
     at.addScaledVector(new THREE.Vector3().crossVectors(at,axis).normalize(),gap);
    }else{
     const push=(gap-distance)/distance;
     at.x+=dx*push;at.y+=dy*push;at.z+=dz*push;
    }
    moved=true;
   }
   if(!moved)break;
  }
  const ground=point=>{
   const direction=point.normalize();
   return point.copy(direction.multiplyScalar(this.radius+this.height.height(direction)));
  };
  if(!this.clearOf(crown,at)){
   const up=at.clone().normalize();
   const axis=Math.abs(up.y)<.9?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0);
   const side=new THREE.Vector3().crossVectors(up,axis).normalize();
   const other=new THREE.Vector3().crossVectors(up,side).normalize();
   const probe=new THREE.Vector3();
   search:for(let ring=1;ring<=6;ring++){
    const radius=ring*(crown+1.2);
    for(let step=0;step<12;step++){
     const angle=step/12*Math.PI*2;
     probe.copy(at).addScaledVector(side,Math.cos(angle)*radius).addScaledVector(other,Math.sin(angle)*radius);
     if(this.clearOf(crown,ground(probe))){at.copy(probe);break search;}
    }
   }
  }
  if(at.distanceToSquared(position)>1e-12)ground(at);
  return at;
 }
 findTree(id){return this.entryById.get(id)||null;}
 unloadTree(id){
  const entry=this.entryById.get(id);
  if(!entry)return;
  if(entry.state==='falling'||entry.state==='fading'||entry.state==='flying')return;
  this.entryById.delete(id);
  this.objects.despawn(id);
  this.trees.splice(this.trees.indexOf(entry),1);
  this.treeVisual.remove(entry);
  this.root.remove(entry.tree);
  this.treeVisual.release(entry.trunk,entry.foliage);
  entry.foliage.material.dispose();
 }
 // Screen taps mark a tree or grass clump to gather once the avatar walks up to
 // it; sticks and stones use ground.select() and collect themselves instead.
 tapGather(type,id){this.tapTarget=type&&id?{type,id}:null;}
 clearTapGather(){this.tapTarget=null;}
 // A carcass is opened by the tap that lands on it, and only with the knife
 // already in hand: nothing is remembered, so drawing a knife later can never
 // loot a pig you tapped some other time.
 tapCarcass(id){
  const creature=this.creatures.get(id);
  if(!creature?.dead)return false;
  if((this.shared?.getEquippedTool(this.playerId)||null)!=='knife')return false;
  if(creature.at.distanceTo(this.player.position)>CARCASS_REACH)return false;
  this.creatures.harvest(creature.id,this.playerId);
  return true;
 }
 gatherTapTarget(body){
  const target=this.tapTarget;
  if(!target)return;
  const avatar=body?.getPosition();
  if(!avatar)return;
  const at=new THREE.Vector3(avatar.x,avatar.y,avatar.z);
  const tool=this.shared?.getEquippedTool(this.playerId)||null;
  if(target.type==='tree'){
   const t=this.findTree(target.id);
   if(!t||t.state!=='standing'){this.clearTapGather();return;}
   if(t.at.distanceTo(at)>2.4)return;
   if(tool==='axe')this.fell(t,this.playerId);
   this.clearTapGather();
  }else if(target.type==='grass'){
   const c=this.grass.clumps.get(target.id);
   if(!c||c.state!=='standing'){this.clearTapGather();return;}
   if(c.position.distanceTo(at)>1.8)return;
   if(tool==='scythe')this.grass.cut(c,this.playerId);
   this.clearTapGather();
  }else if(target.type==='boar'){
   const creature=this.creatures.get(target.id);
   // A carcass is never worked from a remembered target: tapCarcass() loots it
   // on the tap itself, so anything still holding one drops it here.
   if(!creature||creature.dead){this.clearTapGather();return;}
   // One tap, one hit, and only with a weapon that actually reaches it.
   const weapon=this.creatures.combat.weapon(tool);
   if(!weapon){this.clearTapGather();return;}
   if(creature.at.distanceTo(at)>weapon.reach)return;
   this.creatures.strike(creature.id,tool);
   this.clearTapGather();
  }else this.clearTapGather();
 }
 update(dt,body=null){
  const streamRadius=this.terrain.resourceStreamRadius();
  for(const zone of this.zones)zone.update(this.player.position,streamRadius);
  super.update(dt,body);
  this.gatherTapTarget(body);
  // The equipped tool is drawn in the hand; swapping is a no-op unless it changed.
  this.player.setTool(this.shared?.getEquippedTool(this.playerId)||null);
  this.grass.update(dt,body,this.shared?.getEquippedTool(this.playerId));
  this.ground.update(dt,body);
  this.creatures.update(dt,{tool:this.shared?.getEquippedTool(this.playerId)||null});
 }
}
