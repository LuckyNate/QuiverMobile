// Cooking: what the pot holds and what can be made in it. The fire itself is not
// here — whether there is a burning fire to cook on is the world's question, asked
// before any of this runs. These rules only need the pack and the pot in it, so
// they are testable without a renderer, a scene or a fire.
//
// The pot is the only vessel: it carries salt water, then boiled water, then the
// meal cooked in it, one thing at a time, and what it holds sits in the inventory
// beside everything else carried. Raw water is never drunk, and the cup is what
// drinks it once boiled. What a vessel can do is offered over the vessel itself.
export const POT_STATES=Object.freeze(['raw','clean','soup']);
// Sitting at a fire with salt water in the pot is the whole of boiling: the fire
// does the work over this long, and nobody has to tap anything to make it happen.
export const BOIL_SECONDS=45;
// A full pot holds this many servings of what is in it, water or meal. The pot is
// where it keeps; a cup drinks a serving and a bowl eats one, one at a time.
export const SERVINGS_PER_POT=2;
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
 // How many servings are left in the pot; zero unless it holds a meal.
 get servings(){return this.pot==='soup'?Math.max(0,this.inventory.potServings||0):0;}
 // Clean water is served the same way, a cup at a time.
 get waterServings(){return this.pot==='clean'?Math.max(0,this.inventory.potServings||0):0;}
 has(tool){return this.shared.hasTool(this.playerId,tool);}
 write(patch){return this.shared.updateInventory(this.playerId,patch);}
 say(text){this.message?.(text);}
 // The water: the pot goes in empty and comes out holding salt water.
 canFill(){return this.pot===null&&this.has('pot');}
 fill(){
  if(!this.canFill())return false;
  this.write({pot:'raw',potServings:0});
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
   this.write({pot:'clean',potServings:SERVINGS_PER_POT});
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
 // The cup is what water is drunk from, one serving at a time out of the pot.
 canDrink(){return this.waterServings>0&&this.has('cup');}
 drink(){
  if(!this.canDrink())return false;
  const left=this.waterServings-1;
  // The last serving empties the pot; until then the rest keeps in it.
  this.write(left>0?{potServings:left}:{pot:null,potServings:0});
  // An empty pot leaves nothing to drink from, so the cup comes out of the hand.
  if(left===0)this.shared.setEquippedTool(this.playerId,null);
  this.onThirst?.();
  this.say(left>0?'You drink a cup of water. '+left+' left in the pot.':'You drink the last of the water.');
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
  const patch={pot:'soup',potServings:SERVINGS_PER_POT};
  for(const [item,count] of Object.entries(recipe.needs))patch[item]=(inventory[item]||0)-count;
  this.write(patch);
  // The meal stays in the pot, which is where it keeps; a bowl is what it is
  // eaten from, so cooking does not put anything in the hand.
  this.say('You make '+recipe.name.toLowerCase()+'.');
  return true;
 }
 // A bowl is what a meal is eaten from, one serving at a time out of the pot.
 canEat(){return this.servings>0&&this.has('bowl');}
 eat(){
  if(!this.canEat())return false;
  const left=this.servings-1;
  // The last serving empties the pot; until then the rest keeps in it.
  this.write(left>0?{potServings:left}:{pot:null,potServings:0});
  this.onHunger?.();
  this.say(left>0?'You eat a bowl of soup. '+left+' left in the pot.':'You eat the last of the soup.');
  return true;
 }
}
