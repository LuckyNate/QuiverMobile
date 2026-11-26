// The player's health pool in hit points: a level 1 hit takes one of these.
export const PLAYER_HEALTH=10;
// One drink from a cup of boiled water. There is no canteen, so water is taken
// where it is found and the whole mouthful goes straight into the thirst meter.
export const DRINK_RESTORES=.34;
// A bowl of dandelion soup. Hunger is the meter it fills; it is the only cooked
// meal in the game so far, so the number lives here beside the drink.
export const SOUP_RESTORES=.45;
// Survival needs. Each is 1 fully sated, 0 empty, and drifts at a fixed rate.
// Health is the one meter combat writes; the rest are display-only and nothing
// kills the player when a meter empties, because death and respawn rules are
// still undecided. The drift rates are slow on purpose so a needle is visible in
// a session without punishing exploration.
const NEEDS=[
 {id:'health',label:'HP',colour:'198,66,66',perSecond:0,start:1},
 {id:'thirst',label:'T',colour:'74,168,216',perSecond:1/480,start:.82},
 {id:'hunger',label:'H',colour:'224,163,60',perSecond:1/600,start:.76},
 {id:'warmth',label:'W',colour:'217,102,63',perSecond:1/900,start:.9},
 // Stamina recovers instead of draining: a full ring that empties in a fight.
 {id:'stamina',label:'S',colour:'111,191,95',perSecond:-1/45,start:1}
];
const clamp=(v,low,high)=>Math.max(low,Math.min(high,v));
export class Survival{
 constructor(){
  this.values={};
  for(const need of NEEDS)this.values[need.id]=need.start;
 }
 update(dt){
  for(const need of NEEDS){
   this.values[need.id]=clamp(this.values[need.id]-need.perSecond*dt,0,1);
  }
 }
 // Damage is a fraction of the health meter.
 damage(amount){
  const hit=Math.max(0,Number(amount)||0);
  this.values.health=clamp(this.values.health-hit,0,1);
  return this.values.health;
 }
 // Combat damage arrives in hit points out of PLAYER_HEALTH, the same unit a
 // creature's health uses, so a level 1 bite costs a tenth of the meter.
 hurt(points){
  return this.damage(Math.max(0,Number(points)||0)/PLAYER_HEALTH*100);
 }
 // A cup of boiled water: thirst comes back and nothing else changes. Returns how
 // much the meter actually took, so a full player is not told they drank.
 drink(amount=DRINK_RESTORES){
  const before=this.values.thirst;
  this.values.thirst=clamp(before+Math.max(0,Number(amount)||0),0,1);
  return this.values.thirst-before;
 }
 // A bowl of soup: hunger comes back and nothing else changes.
 eat(amount=SOUP_RESTORES){
  const before=this.values.hunger;
  this.values.hunger=clamp(before+Math.max(0,Number(amount)||0),0,1);
  return this.values.hunger-before;
 }
 // Lowest first, so the most urgent need is the one at the front of the stack.
 needs(){
  return NEEDS
   .map(need=>({id:need.id,label:need.label,colour:need.colour,value:this.values[need.id]}))
   .sort((a,b)=>a.value-b.value||a.id.localeCompare(b.id));
 }
}
