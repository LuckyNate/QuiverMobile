// Cooking: what the camp's vessels hold and what they can make. The fire itself
// is not here — whether there is a burning fire to cook on is the world's
// question, asked before any of this runs. These rules only need the pack and the
// vessels in it, so they are testable without a renderer, a scene or a fire.
//
// The pot is the only thing that carries water: salt from the sea, clean after
// boiling. Raw water is never drunk. A cup drinks, a bowl cooks and eats, so the
// vessel in the hand is what decides what tapping the fire means.
export const POT_STATES=Object.freeze(['raw','clean']);
// Sitting at a fire with salt water in the pot is the whole of boiling: the fire
// does the work over this long, and nobody has to tap anything to make it happen.
export const BOIL_SECONDS=45;
export class Kitchen {
 constructor({shared,playerId='local-owner',onThirst=null,onHunger=null,message=null,boilSeconds=BOIL_SECONDS}={}){
  if(!shared)throw new TypeError('Kitchen requires the shared world');
  Object.assign(this,{shared,playerId,onThirst,onHunger,message,boilSeconds});
  // When this moment passes the water is clean; null means nothing is on the fire.
  this.boilUntil=null;
 }
 get inventory(){return this.shared.getInventory(this.playerId);}
 get pot(){const water=this.inventory.potWater;return POT_STATES.includes(water)?water:null;}
 get soup(){const count=this.inventory.soup;return Number.isSafeInteger(count)&&count>0?count:0;}
 has(tool){return this.shared.hasTool(this.playerId,tool);}
 write(patch){return this.shared.updateInventory(this.playerId,patch);}
 say(text){this.message?.(text);}
 // The water: the pot goes in empty and comes out holding salt water.
 canFill(){return this.pot===null&&this.has('pot');}
 fill(){
  if(!this.canFill())return false;
  this.write({potWater:'raw'});
  this.say('You fill the pot with salt water.');
  return true;
 }
 // A fire: boiling is the only way raw water becomes fit to drink. Standing in
 // reach of a burning fire with the pot in hand starts it, and the clock finishes
 // it — the player sits down and waits, which is what cooking is.
 boilLeft(now=Date.now()){return this.boilUntil?Math.max(0,(this.boilUntil-now)/1000):0;}
 get boiling(){return Boolean(this.boilUntil);}
 // The fire has to be lit for any of this; the reach is the fire's own business.
 canBoil(){return this.pot==='raw';}
 boil(now=Date.now()){
  if(!this.canBoil()||this.boilUntil)return false;
  this.boilUntil=now+this.boilSeconds*1000;
  this.say('You set the pot on the fire.');
  return true;
 }
 update(now=Date.now(),{atFire=false}={}){
  if(this.boilUntil){
   if(now<this.boilUntil)return false;
   this.boilUntil=null;
   this.write({potWater:'clean'});
   // Clean water is the end of the pot's job, so it leaves the hand: the next
   // question is what to do with the water, not what to be holding.
   this.shared.setEquippedTool(this.playerId,null);
   this.say('The water boils and clears.');
   return true;
  }
  if(!atFire)return false;
  if(this.shared.getEquippedTool(this.playerId)!=='pot')return false;
  return this.boil(now);
 }
 canDrink(){return this.pot==='clean'&&this.has('cup');}
 drink(){
  if(!this.canDrink())return false;
  this.write({potWater:null});
  this.onThirst?.();
  this.say('You drink the boiled water.');
  return true;
 }
 // Soup takes clean water, dandies and meat, and a bowl to serve it in.
 canCookSoup(){
  const inventory=this.inventory;
  return this.pot==='clean'&&this.has('bowl')&&(inventory.dandies||0)>=1&&(inventory.rawBacon||0)>=1;
 }
 cookSoup(){
  if(!this.canCookSoup())return false;
  const inventory=this.inventory;
  this.write({potWater:null,dandies:inventory.dandies-1,rawBacon:inventory.rawBacon-1,soup:this.soup+1});
  this.say('You make dandelion soup.');
  return true;
 }
 canEat(){return this.soup>0&&this.has('bowl');}
 eat(){
  if(!this.canEat())return false;
  this.write({soup:this.soup-1});
  this.onHunger?.();
  this.say('You eat the soup.');
  return true;
 }
}
