// The player's health pool in hit points: a level 1 hit takes one of these.
export const PLAYER_HEALTH=10;
// Every meter holds this many points. Capacity is meant to grow with level progress,
// which is not in place yet, so all of them start at the same ten.
export const METER_CAPACITY=10;
// A cup of boiled water and a bowl of soup put points back into their meter. Thirst
// falls a point a minute and hunger half that, so a belly lasts twice as long as a
// thirst: a drink is worth three minutes of quick feet and a bowl of soup eight of a
// sharpened blade. A kitchen may hand over the points its own dish is worth.
export const DRINK_RESTORES=3;
export const SOUP_RESTORES=4;
// While a meter is not empty its buff holds: a fed player hits half again as hard, a
// watered one moves half again as fast. It runs out with the meter, not on a timer.
export const BUFF_MULTIPLIER=1.5;
// A plain drink or a lean meal only ever fills a meter to its brim. Something better
// can be poured in past it, up to this much: the extra is real stored meter that
// drains away at the same rate, so a player who never lets a meter run dry carries a
// bigger one for as long as the top-up lasts.
export const OVERFILL=1.2;
// Survival needs, each measured in points out of its own capacity and drifting at a
// fixed rate. Hunger and thirst are the two that carry buffs. Health is the one meter
// combat writes. Nothing kills the player when a meter empties, because death and
// respawn rules are still undecided; the drift is slow on purpose so a session shows
// the meters moving without punishing exploration.
// Hunger drifts at half the thirst rate, so food carries a player twice as far as
// water does and a belly is worth the walk to fill.
const NEEDS=[
 {id:'health',label:'HP',colour:'198,66,66',capacity:METER_CAPACITY,perSecond:0,start:METER_CAPACITY},
 {id:'thirst',label:'T',colour:'74,168,216',capacity:METER_CAPACITY,perSecond:1/60,start:8},
 {id:'hunger',label:'H',colour:'224,163,60',capacity:METER_CAPACITY,perSecond:1/120,start:7},
 {id:'warmth',label:'W',colour:'217,102,63',capacity:METER_CAPACITY,perSecond:10/900,start:9},
 // Stamina recovers instead of draining: a full meter that empties in a fight.
 {id:'stamina',label:'S',colour:'111,191,95',capacity:METER_CAPACITY,perSecond:-10/45,start:METER_CAPACITY}
];
const clamp=(v,low,high)=>Math.max(low,Math.min(high,v));
export class Survival {
 constructor(){
  this.values={};
  this.capacities={};
  for(const need of NEEDS){
   this.values[need.id]=need.start;
   this.capacities[need.id]=need.capacity;
  }
 }
 capacity(id){return this.capacities[id]??METER_CAPACITY;}
 // Drift never squashes an overflow: the meter holds what was poured into it and
 // drains from there, which is what makes a better dish last longer.
 update(dt){
  for(const need of NEEDS){
   this.values[need.id]=clamp(this.values[need.id]-need.perSecond*dt,0,need.capacity*OVERFILL);
  }
 }
 // Damage is in hit points, out of the health meter's capacity.
 damage(points){
  const hit=Math.max(0,Number(points)||0);
  this.values.health=clamp(this.values.health-hit,0,this.capacity('health'));
  return this.values.health;
 }
 // Combat already speaks in hit points, so nothing is converted here.
 hurt(points){
  return this.damage(points);
 }
 // A drink: thirst comes back and nothing else changes. Plain water stops at the
 // brim; a richer drink may go past it. Returns how many points the meter actually
 // took, so a full player is not told they drank.
 drink(amount=DRINK_RESTORES,rich=false){
  return this.fill('thirst',amount,rich);
 }
 // A meal: hunger comes back and nothing else changes. A plain one stops at the
 // brim, a better one may go past it.
 eat(amount=SOUP_RESTORES,rich=false){
  return this.fill('hunger',amount,rich);
 }
 // Filling a meter. Nothing ever takes points away here: a plain drink poured into a
 // meter already run past its brim leaves the overflow where it is.
 fill(id,amount,rich){
  const before=this.values[id];
  const ceiling=this.capacity(id)*(rich?OVERFILL:1);
  this.values[id]=Math.max(before,Math.min(before+Math.max(0,Number(amount)||0),ceiling));
  return this.values[id]-before;
 }
 // The buffs. A meter is either empty or it is not; there is no half strength.
 get damageBuff(){return this.values.hunger>0?BUFF_MULTIPLIER:1;}
 get speedBuff(){return this.values.thirst>0?BUFF_MULTIPLIER:1;}
 // Normalised for the meters: every need reads against its own capacity, so a meter
 // run past its brim reads above 1. Lowest first, so the most urgent need is the one
 // at the front of the stack.
 needs(){
  return NEEDS
   .map(need=>({id:need.id,label:need.label,colour:need.colour,capacity:need.capacity,
    value:this.values[need.id]/need.capacity}))
   .sort((a,b)=>a.value-b.value||a.id.localeCompare(b.id));
 }
}
