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
import {HealthPips} from '../creature/health-pip.js';
import {ArrowSystem} from '../combat/arrows.js';
import {BOW,planShot} from '../combat/arrow.js';
import {WORLD_SETUP,BIOME_SETUP} from '../world/world-config.js';
import {TouchRegistry} from './interaction.js';
import {TREE_HARVEST} from '../flora/tree.js';
import {InstanceStore} from '../population/instance-store.js';

// How close the avatar has to stand for a tap to reach what it landed on. A tree
// states its own reach and tool beside its resource contract, in flora/tree.js.
const GRASS_REACH=1.8,CARCASS_REACH=1.6;
// How far from the sea an avatar may stand and still dip the pot in it.
const WATER_REACH=1.6;

// What a touch means, per kind. Walking stays the input layer's business; this
// says what a kind offers once the avatar is standing on it with the right thing
// in hand. Built from the host, not stored in a constructor, so any host with
// these methods answers to the same rules — and an enemy registers here beside a
// tree, by the same rule, instead of adding a branch to the touch handler.
function touchRules(host){
 const touch=new TouchRegistry();
 touch.register('tree',{
  find:id=>host.findTree(id),at:tree=>tree.at,
  offers:[{...TREE_HARVEST,applies:tree=>tree.state==='standing',
   run:tree=>host.fell(tree,host.playerId)}]
 });
 touch.register('grass',{
  find:id=>host.grass.clumps.get(id),at:clump=>clump.position,
  offers:[{verb:'cut',tool:'scythe',reach:GRASS_REACH,applies:clump=>clump.state==='standing',
   run:clump=>host.grass.cut(clump,host.playerId)}]
 });
 // The camp fire is not touched: a burning fire does its work on its own clock
 // while the avatar sits at it, and what the vessel in hand can do is offered
 // over the vessel itself rather than over the fire.
 touch.register('boar',{
  find:id=>host.creatures.get(id),at:creature=>creature.at,
  offers:[
   // A carcass needs the knife already in hand and the avatar standing at it.
   {verb:'skin',tool:'knife',reach:CARCASS_REACH,applies:creature=>creature.dead,
    run:creature=>host.creatures.harvest(creature.id,host.playerId)},
   // A living boar takes one hit from whatever weapon is in hand and in reach.
   // The bow never does: it only looses an arrow when the string is let go, so
   // with nothing melee in hand this offer reaches nothing.
   {verb:'attack',tool:null,applies:creature=>!creature.dead,
    reach:({weapon})=>weapon&&!weapon.ranged?weapon.reach:0,
    run:(creature,{tool})=>host.creatures.strike(creature.id,tool)}
  ]
 });
 return touch;
}

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
  this.instances=new InstanceStore();
  this.spawns=new SpawnRegistry();
  this.grass=new TallGrassField({root:this.root,shared,player,playerId});
  this.grass.onDiscovery=()=>this.onDyeDiscovery?.();
  this.ground=new GroundResources({root:this.root,shared,player,playerId});
  // A pickup can teach a colour too: the dandies are the yellow dye.
  this.ground.onDiscovery=()=>this.onDyeDiscovery?.();
  // Attached by the game once the camp fire, the sea and the kitchen exist: the
  // kitchen owns what the vessels hold and the fire owns whether it is burning.
  // Water is gathered from the sea that is already in the world, so the handler
  // needs a reading of it rather than a spawned object.
  this.fire=null;
  this.kitchen=null;
  this.water=null;
  // Enemies live in their own system: species modules own behaviour and combat,
  // while the spawn registry only knows this is a creature kind.
  this.creatures=new CreatureSystem({root:this.root,shared,player,playerId,height,radius,camera,
   onPlayerDamage});
  // Arrows belong to the shot: they exist between release and arrival, and the
  // hit is decided by the release, not by where the animal has run to since.
  this.arrows=new ArrowSystem({root:this.root,onArrive:(plan,id)=>{
   if(plan.hit)this.creatures.damage(id,this.creatures.combat.damage('bow'));
  }});
  // How far the string is back, over the avatar's head. Purely a drawing of the
  // live draw; nothing reads it.
  this.drawGauge=new HealthPips({root:this.root,camera,lift:1.6,fill:0xd9a63a});
  this.bowDraw=null;
  this.attachPhysics=physics=>{this.creatures.physics=physics;};
  // Each kind names the adapter that owns its live objects, the category it
  // belongs to, and how long a removed one waits before its cell may put it back.
  // A creature registers beside a resource without pretending to be one.
  this.spawns.register({type:'tree',category:'resource',respawnSeconds:8,adapter:{
   spawn:(id,position,context)=>{
    // A collected tree keeps its entry until the cell is evicted; retire it so the
    // same seeded slot can stand again. The record goes with it, or the store would
    // still answer for the felled tree and the slot could never refill.
    if(this.findTree(id)?.state==='collected'){this.unloadTree(id);this.instances.drop(id);}
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
  // Dandies are picked up by the same bare-handed pipeline as sticks and stones.
  for(const type of ['stick','stone','dandy'])this.spawns.register({type,category:'resource',respawnSeconds:20,adapter:{
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
 inTransition(id){return this.spawns.isBusy(this.instances.typeOf(id),id);}
 // The kind makes and destroys; this only remembers what it made, so a resource,
 // a creature and an enemy are all found again by the same id the same way.
 spawn(type,id,position,context){
  const instance=this.spawns.spawn(type,id,position,context);
  if(!instance)return false;
  // A seeded slot may still hold a record from an earlier life.
  this.instances.drop(id);
  this.instances.put(type,id,instance);
  return true;
 }
 unload(id){
  const type=this.instances.typeOf(id);
  if(!type)return;
  this.spawns.unload(type,id);
  this.instances.drop(id);
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
  if(this.instances.of('tree',id))return false;
  const record=this.shared?.getEntity(id);
  if(record&&record.state!=='standing')return false;
  return this.makeTree(chunk,0,this.spacedPosition(id,position),id);
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
 findTree(id){return this.instances.of('tree',id);}
 unloadTree(id){
  const entry=this.instances.of('tree',id);
  if(!entry)return;
  if(entry.state==='falling'||entry.state==='fading'||entry.state==='flying')return;
  this.objects.despawn(id);
  this.trees.splice(this.trees.indexOf(entry),1);
  this.treeVisual.remove(entry);
  this.root.remove(entry.tree);
  this.treeVisual.release(entry.trunk,entry.foliage);
  entry.foliage.material.dispose();
 }
 // A touch acts on the spot. Each kind's own offers say what is possible; this
 // only asks with what is in hand and how close the avatar stands, so nothing
 // here names a type. False means the tap only walks you toward the target, and
 // the next tap acts — nothing is stored between taps, so no later walk or tool
 // swap can set off an action the player did not just ask for.
 tapNow(type,id){
  const touch=(this.touch??=touchRules(this));
  const tool=this.shared?.getEquippedTool(this.playerId)||null;
  return touch.act(type,id,{tool,weapon:this.creatures.combat.weapon(tool),
   position:this.player.position,playerId:this.playerId});
 }
 // Water is gathered where the world already keeps it. A tap that lands under the
 // sea surface fills the pot, so long as the avatar is standing at the water with
 // the pot in hand.
 fillPotAt(point){
  if(!this.water||!point)return false;
  const surface=this.water.radius;
  if(point.length()>surface)return false;
  if(this.player.position.length()>surface+WATER_REACH)return false;
  if(this.shared?.getEquippedTool(this.playerId)!=='pot')return false;
  return this.kitchen?.fill()??false;
 }
 // Pressing an animal with the bow in hand draws the string. Beyond the bow's
 // range it is not raised at all, so there is nothing to release.
 drawBow(id,now=Date.now()){
  if(this.bowDraw)return null;
  if(this.shared?.getEquippedTool(this.playerId)!=='bow')return null;
  const creature=this.creatures.get(id);
  if(!creature||creature.dead)return null;
  if(creature.at.distanceTo(this.player.position)>BOW.range)return null;
  this.bowDraw={id,started:now};
  return this.bowDraw;
 }
 // Letting go is the whole aim: how long the string was held is how far the arrow
 // carries, so an early release drops short and a long one flies past.
 releaseBow(hold=null,now=Date.now()){
  const draw=this.bowDraw;
  this.bowDraw=null;
  if(!draw)return {fired:false,reason:'none'};
  const creature=this.creatures.get(draw.id);
  if(!creature||creature.dead)return {fired:false,reason:'gone'};
  const seconds=hold??(now-draw.started)/1000;
  const from=this.player.position;
  const plan=planShot({from,to:creature.at,up:from.clone().normalize(),hold:seconds});
  if(!plan.fired)return plan;
  const swing=this.creatures.combat.strike({actorId:this.playerId,weapon:'bow',target:null,now});
  if(!swing.swing)return {fired:false,reason:'cooldown'};
  this.arrows.fire(plan,draw.id);
  return plan;
 }
 cancelDraw(){this.bowDraw=null;}
 update(dt,body=null){
  const streamRadius=this.terrain.resourceStreamRadius();
  for(const zone of this.zones)zone.update(this.player.position,streamRadius);
  super.update(dt,body);
  // The equipped tool is drawn in the hand; swapping is a no-op unless it changed.
  this.player.setTool(this.shared?.getEquippedTool(this.playerId)||null);
  this.grass.update(dt,body,this.shared?.getEquippedTool(this.playerId));
  this.ground.update(dt,body);
  this.creatures.update(dt,{tool:this.shared?.getEquippedTool(this.playerId)||null});
  this.arrows.update(dt);
  if(this.bowDraw){
   const held=(Date.now()-this.bowDraw.started)/1000;
   this.drawGauge.show('bow-notch',this.player.position,Math.min(1,held/BOW.drawSeconds));
  }else this.drawGauge.hide('bow-notch');
  this.drawGauge.update();
 }
}
