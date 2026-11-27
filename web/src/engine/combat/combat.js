// Combat rules only: what a weapon does, when it may swing again, and one damage
// path for every target that has health. A weapon's level is the health it takes
// per hit, so a level 1 club does 1 hp and a boar's three points cost three hits.
// Movement, senses and rendering live in the creature modules; nothing here knows
// what a boar is.
import {BOW} from './arrow.js';

export const WEAPONS=Object.freeze({
 club:{level:1,reach:2.2,cooldown:.6},
 knife:{level:1,reach:1.2,cooldown:.4},
 // The bow has range instead of reach: it never hits on the spot. Its shots are
 // loosed on release, so the cooldown belongs to letting the string go.
 bow:{level:1,range:BOW.range,cooldown:.9,ranged:true}
});

export class Combat {
 constructor({weapons=WEAPONS}={}){
  this.weapons=weapons;
  this.clocks=new Map();
  // What the actor's own condition does to its damage. A weapon still says what it
  // does; a fed player hits half again as hard, which is a multiplier on the
  // player, not a different sword.
  this.scale=1;
 }
 weapon(name){return this.weapons[name]||null;}
 // Health one hit takes with that weapon, under the actor's current condition.
 damage(name){const spec=this.weapon(name);return spec?spec.level*this.scale:0;}
 // Milliseconds before that actor may swing the same weapon again.
 readyIn(actorId,weapon,now){
  const spec=this.weapon(weapon);
  if(!spec)return Infinity;
  return Math.max(0,(this.clocks.get(actorId)??-Infinity)+spec.cooldown*1000-now);
 }
 // One damage rule for creatures and the player alike: health floors at zero and
 // the killing blow is reported once, so spawn, loot and sound can each react.
 hit(target,amount){
  if(!target||target.dead||!Number.isFinite(target.health))return {damage:0,killed:false};
  const dealt=Math.min(target.health,Math.max(0,amount));
  target.health-=dealt;
  const killed=target.health===0&&!target.dead;
  if(killed)target.dead=true;
  return {damage:dealt,killed};
 }
 // A swing always costs its cooldown; damage only lands if a target was given.
 strike({actorId='player',weapon,target,now=Date.now()}){
  const spec=this.weapon(weapon);
  if(!spec||this.readyIn(actorId,weapon,now)>0)return {swing:false,damage:0,killed:false};
  this.clocks.set(actorId,now);
  const {damage,killed}=this.hit(target,this.damage(weapon));
  return {swing:true,damage,killed};
 }
}
