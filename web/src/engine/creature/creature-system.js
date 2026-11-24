import {Combat} from '../combat/combat.js';
import {Boar,BOAR_BEHAVIOUR} from './boar.js';
import {BoarVisual} from './boar-visual.js';
import {seededUnit} from '../world/seeded-hash.js';
import {surfaceFrame,yawFor} from './behaviour.js';

// One species module per enemy. The population system only hands over an id and a
// seeded slot; the module owns the stats, the behaviour, and which visual draws it.
export const SPECIES=Object.freeze({
 boar:{create:options=>new Boar(options),behaviour:BOAR_BEHAVIOUR}
});

export class CreatureSystem {
 constructor({root,shared,player,playerId,height,radius,combat=new Combat(),species=SPECIES,
  onPlayerDamage=null}={}){
  Object.assign(this,{root,shared,player,playerId,height,radius,combat,species,onPlayerDamage});
  this.live=new Map();
  this.visuals={boar:new BoarVisual({root,shared,player,playerId})};
 }
 get size(){return this.live.size;}
 has(id){return this.live.has(id);}
 creatures(){return this.live.values();}
 spawn(type,id,position){
  if(this.live.has(id))return false;
  const module=this.species[type];
  if(!module)return false;
  // A dead or harvested creature is not rebuilt by streaming; only the spawn
  // system's respawn path clears that record and calls back in.
  const saved=this.shared?.getEntity(id);
  if(saved&&saved.state!=='standing')return false;
  const creature=module.create({id,position:position.toArray(),home:position.toArray()});
  const {up,nose}=surfaceFrame(creature.at);
  creature.heading=nose.applyAxisAngle(up,seededUnit(id,'yaw')*Math.PI*2);
  creature.patrolWait=1+seededUnit(id,'idle')*3;
  this.visuals[type].spawn(id,position);
  this.live.set(id,creature);
  return true;
 }
 unload(id){
  const creature=this.live.get(id);
  if(!creature)return false;
  this.visuals[creature.type].unload(id);
  this.live.delete(id);
  return true;
 }
 update(dt,{tool=null,now=Date.now()}={}){
  for(const visual of Object.values(this.visuals))visual.update?.();
  const context={player:this.player.position,height:this.height,radius:this.radius,
   hitPlayer:amount=>this.onPlayerDamage?.(amount),
   retire:creature=>this.unload(creature.id)};
  for(const creature of this.live.values()){
   this.species[creature.type].behaviour.think(creature,dt,context);
   this.draw(creature);
  }
  this.swing(tool,now);
 }
 draw(creature){
  const visual=this.visuals[creature.type];
  visual.place(creature.id,creature.at,yawFor(creature.at,creature.heading));
  visual.setFade(creature.id,creature.fade);
 }
 // The equipped weapon swings on contact, the same way an axe meets a trunk.
 // One target per swing: the nearest living creature inside the weapon's reach.
 swing(tool,now){
  const weapon=this.combat.weapon(tool);
  if(!weapon)return null;
  const at=this.player.position;
  let target=null,distance=Infinity;
  for(const creature of this.live.values()){
   if(creature.dead)continue;
   const metres=creature.at.distanceTo(at);
   if(metres<=weapon.reach&&metres<distance){target=creature;distance=metres;}
  }
  if(!target)return null;
  const result=this.combat.strike({actorId:this.playerId,weapon:tool,target,now});
  if(result.killed)this.kill(target);
  return result;
 }
 // Death is a short beat: the species plays its dying state, then the creature is
 // removed, which is what tells the population system to schedule its return.
 kill(creature){
  this.species[creature.type].behaviour.enter(creature,'dying');
  creature.dead=true;
  this.shared?.setEntity(creature.id,{state:'dead',position:creature.at.toArray()});
 }
}
