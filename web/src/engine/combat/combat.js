// Combat rules only: what a weapon does, when it may swing again, and one damage
// path for every target that has health. Movement, senses and rendering live in
// the creature modules; nothing here knows what a boar is.
export const WEAPONS=Object.freeze({
 club:{damage:8,reach:2.2,cooldown:.6},
 bow:{damage:6,reach:24,cooldown:.9}
});

export class Combat {
 constructor({weapons=WEAPONS}={}){this.weapons=weapons;this.clocks=new Map();}
 weapon(name){return this.weapons[name]||null;}
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
 // A swing always costs its cooldown; damage only lands if something is in reach.
 strike({actorId='player',weapon,target,now=Date.now()}){
  const spec=this.weapon(weapon);
  if(!spec||this.readyIn(actorId,weapon,now)>0)return {swing:false,damage:0,killed:false};
  this.clocks.set(actorId,now);
  const {damage,killed}=this.hit(target,spec.damage);
  return {swing:true,damage,killed};
 }
}
