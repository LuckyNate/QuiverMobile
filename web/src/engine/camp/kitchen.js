// Cooking: what the pot holds and what can be made in it. The fire itself is not
// here — whether there is a burning fire to cook on is the world's question, asked
// before any of this runs. These rules only need the pack and the pot in it, so
// they are testable without a renderer, a scene or a fire.
//
// The pot is the only vessel: it carries salt water, then boiled water, then the
// meal cooked in it, one thing at a time, and what it holds sits in the inventory
// beside everything else carried. Raw water is never drunk, and the pot is what
// drinks it once boiled. What the pot can do is offered over the pot itself.
export const POT_STATES=Object.freeze(['raw','clean','soup']);
// Sitting at a fire with salt water in the pot is the whole of boiling: the fire
// does the work over this long, and nobody has to tap anything to make it happen.
export const BOIL_SECONDS=45;
// What can be cooked in the pot. A recipe says what it takes beyond clean water;
// the kitchen only ever offers the ones the pack can actually cover.
export const RECIPES=Object.freeze([
 {id:'soup',name:'Dandelion soup',needs:{dandies:1,rawBacon:1}}
]);
export class Kitchen {
 constructor({shared,playerId='local-owner',onThirst=null,onHunger=null,message=null,boilSeconds=BOIL_SECONDS}={}){
  if(!shared)throw new TypeError('Kitchen requires the shared world');
  Object.assign(this,{shared,playerId,onThirst,onHunger,message,boilSeconds});
  // When this moment passes the water is clean; null means nothing is on the fire.
  this.boilUntil=null;
 }
 get inventory(){return this.shared.getInventory(this.playerId);}
 // What is in the pot: 'raw', 'clean', 'soup', or null when it is empty.
 get pot(){const contents=this.inventory.pot;return POT_STATES.includes(contents)?contents:null;}
 has(tool){return this.shared.hasTool(this.playerId,tool);}
 write(patch){return this.shared.updateInventory(this.playerId,patch);}
 say(text){this.message?.(text);}
 // The water: the pot goes in empty and comes out holding salt water.
 canFill(){return this.pot===null&&this.has('pot');}
 fill(){
  if(!this.canFill())return false;
  this.write({pot:'raw'});
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
   this.write({pot:'clean'});
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
 // The pot is the cup: what was boiled is drunk from what it was boiled in, which
 // is why the water leaving the hand was the point of the boil.
 canDrink(){return this.pot==='clean';}
 drink(){
  if(!this.canDrink())return false;
  this.write({pot:null});
  // The empty pot has nothing left to offer, so it leaves the hand with the water.
  this.shared.setEquippedTool(this.playerId,null);
  this.onThirst?.();
  this.say('You drink the boiled water.');
  return true;
 }
 canMake(recipe){
  if(!recipe||this.pot!=='clean')return false;
  const inventory=this.inventory;
  return Object.entries(recipe.needs).every(([item,count])=>(inventory[item]||0)>=count);
 }
 // Only what can be cooked right now is offered: an option the pack cannot cover
 // is not an option.
 recipes(){return RECIPES.filter(recipe=>this.canMake(recipe));}
 cook(id){
  const recipe=RECIPES.find(entry=>entry.id===id);
  if(!this.canMake(recipe))return false;
  const inventory=this.inventory;
  const patch={pot:'soup'};
  for(const [item,count] of Object.entries(recipe.needs))patch[item]=(inventory[item]||0)-count;
  this.write(patch);
  // The meal stays in the pot, which is already in the hand, so it goes straight
  // from cooking to eating without being put down.
  this.say('You make '+recipe.name.toLowerCase()+'.');
  return true;
 }
 // The meal is eaten from the pot it was cooked in.
 canEat(){return this.pot==='soup';}
 eat(){
  if(!this.canEat())return false;
  this.write({pot:null});
  this.shared.setEquippedTool(this.playerId,null);
  this.onHunger?.();
  this.say('You eat the soup.');
  return true;
 }
}
