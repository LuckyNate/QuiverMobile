// Cooking: what the camp's vessels hold and what they can make. The fire itself
// is not here — whether there is a burning fire to cook on is the world's
// question, asked before any of this runs. These rules only need the pack and the
// vessels in it, so they are testable without a renderer, a scene or a fire.
//
// The pot is the only thing that carries water: raw from the sea, clean after
// boiling. Raw water is never drunk. A cup drinks, a bowl cooks and eats, so the
// vessel in the hand is what decides what tapping the fire means.
export const POT_STATES=Object.freeze(['raw','clean']);
export class Kitchen {
 constructor({shared,playerId='local-owner',onThirst=null,onHunger=null,message=null}={}){
  if(!shared)throw new TypeError('Kitchen requires the shared world');
  Object.assign(this,{shared,playerId,onThirst,onHunger,message});
 }
 get inventory(){return this.shared.getInventory(this.playerId);}
 get pot(){const water=this.inventory.potWater;return POT_STATES.includes(water)?water:null;}
 get soup(){const count=this.inventory.soup;return Number.isSafeInteger(count)&&count>0?count:0;}
 has(tool){return this.shared.hasTool(this.playerId,tool);}
 write(patch){return this.shared.updateInventory(this.playerId,patch);}
 say(text){this.message?.(text);}
 // The water: the pot goes in empty and comes out holding raw water.
 canFill(){return this.pot===null&&this.has('pot');}
 fill(){
  if(!this.canFill())return false;
  this.write({potWater:'raw'});
  this.say('You fill the pot with water.');
  return true;
 }
 // A fire: boiling is the only way raw water becomes fit to drink.
 canBoil(){return this.pot==='raw';}
 boil(){
  if(!this.canBoil())return false;
  this.write({potWater:'clean'});
  this.say('The water boils and clears.');
  return true;
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
