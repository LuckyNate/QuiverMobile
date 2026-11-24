import {Combat} from '../combat/combat.js';
import {Boar,BOAR,BOAR_BEHAVIOUR} from './boar.js';
import {BoarVisual} from './boar-visual.js';
import {HealthPips} from './health-pip.js';
import {seededUnit} from '../world/seeded-hash.js';
import {surfaceFrame,yawFor} from './behaviour.js';

// One species module per enemy. The population system only hands over an id and a
// seeded slot; the module owns the stats, the behaviour, the loot and the art.
export const SPECIES=Object.freeze({
 boar:{create:options=>new Boar(options),behaviour:BOAR_BEHAVIOUR,loot:BOAR.loot}
});

export class CreatureSystem {
 constructor({root,shared,player,playerId,height,radius,combat=new Combat(),species=SPECIES,
  camera=null,onPlayerDamage=null}={}){
  Object.assign(this,{root,shared,player,playerId,height,radius,combat,species,camera,onPlayerDamage});
  this.live=new Map();
  this.visuals={boar:new BoarVisual({root,shared,player,playerId})};
  this.pips=new HealthPips({root,camera});
 }
 get size(){return this.live.size;}
 has(id){return this.live.has(id);}
 get(id){return this.live.get(id)||null;}
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
  this.pips.remove(id);
  this.live.delete(id);
  return true;
 }
 update(dt,{tool=null,now=Date.now()}={}){
  for(const visual of Object.values(this.visuals))visual.update?.();
  this.pips.update();
  const weapon=this.combat.weapon(tool);
  const context={player:this.player.position,height:this.height,radius:this.radius,
   hitPlayer:amount=>this.onPlayerDamage?.(amount),
   retire:creature=>this.unload(creature.id)};
  for(const creature of this.live.values()){
   this.species[creature.type].behaviour.think(creature,dt,context);
   this.draw(creature);
   this.pip(creature,weapon);
  }
  return now;
 }
 draw(creature){
  const visual=this.visuals[creature.type];
  visual.place(creature.id,creature.at,yawFor(creature.at,creature.heading));
  visual.setFade(creature.id,creature.fade);
  visual.setTip?.(creature.id,creature.tip);
 }
 // The pip only exists while a weapon is in hand, and never on a carcass.
 pip(creature,weapon){
  if(!weapon||creature.dead){this.pips.hide(creature.id);return;}
  this.pips.show(creature.id,creature.at,creature.health/creature.maxHealth);
 }
 // A tapped creature takes one hit from whatever is in hand, if it is in reach.
 // Contact alone never swings: the player has to ask for each hit.
 strike(id,weapon,now=Date.now()){
  const creature=this.live.get(id);
  if(!creature||creature.dead)return null;
  const result=this.combat.strike({actorId:this.playerId,weapon,target:creature,now});
  if(result.killed)this.kill(creature);
  return result;
 }
 // An arrow that has arrived does its damage now. The release already paid the
 // bow's cooldown, so the hit itself is not gated on it a second time.
 damage(id,amount){
  const creature=this.live.get(id);
  if(!creature||creature.dead)return null;
  const result=this.combat.hit(creature,amount);
  if(result.killed)this.kill(creature);
  return result;
 }
 // Death is not removal: the animal falls where it stands and waits, a carcass,
 // until a knife is used on it. Only then does the population see it gone and
 // schedule its return.
 kill(creature){
  creature.dead=true;
  creature.health=0;
  creature.tip=0;
  this.species[creature.type].behaviour.enter(creature,'dead');
  this.pips.hide(creature.id);
  this.shared?.setEntity(creature.id,{state:'dead',position:creature.at.toArray()});
 }
 // A knife on the carcass hands over what it carried, then the slot is free.
 harvest(id,playerId=this.playerId){
  const creature=this.live.get(id);
  if(!creature||!creature.dead||creature.harvested)return null;
  const loot=this.species[creature.type].loot||{};
  creature.harvested=true;
  for(const [resource,count] of Object.entries(loot))this.shared?.awardResource(playerId,resource,count);
  this.unload(id);
  return {...loot};
 }
}
