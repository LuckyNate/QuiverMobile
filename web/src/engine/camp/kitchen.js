// Cooking: what the pot holds and what can be made in it. The fire itself is not
// here — whether there is a burning fire to cook on is the world's question, asked
// before any of this runs. These rules only need the pack and the pot in it, so
// they are testable without a renderer, a scene or a fire.
//
// The pot is the only vessel: it carries salt water, then boiled water, then the
// dish made in it, one thing at a time, and what it holds sits in the inventory
// beside everything else carried. Raw water is never drunk, the cup drinks water
// and tea, and the bowl eats a meal. What a vessel can do is offered over the
// vessel itself.
export const POT_STATES=Object.freeze(['raw','clean','soup','salad','tea']);
// What is eaten from a bowl. Tea is the same kind of serving but drunk from a cup.
export const EATEN_STATES=Object.freeze(['soup','salad']);
// Sitting at a fire with salt water in the pot is the whole of boiling: the fire
// does the work over this long, and nobody has to tap anything to make it happen.
export const BOIL_SECONDS=45;
// A full pot holds this many servings of what is in it, water or dish. The pot is
// where it keeps; a cup drinks a serving and a bowl eats one, one at a time.
export const SERVINGS_PER_POT=2;
// How long a vessel stays in the hand after it has been used. It is a beat, not a
// rule: the hand keeps the cup or the bowl just long enough to be seen putting it
// away, which is where the animation goes later.
export const USE_DELAY_MS=700;
// What can be made in the pot. A recipe says what it takes beyond what the pot
// already holds (`base`, null for an empty pot), how many points of its meter one
// serving puts back, and whether it is eaten with the bowl or drunk from the cup.
// The kitchen only ever offers the ones the pack can actually cover.
export const RECIPES=Object.freeze([
 // A salad is the first meal of a camp: dandies picked on the way home and no fire
 // at all, so hunger can be answered before the first log is cut.
 {id:'salad',name:'Dandy salad',needs:{dandies:2},base:null,cold:true,restores:2},
 // Soup and tea both start from water already boiled clean.
 {id:'soup',name:'Dandy soup',needs:{dandies:3},base:'clean',restores:4},
 {id:'tea',name:'Dandy tea',needs:{dandies:1},base:'clean',restores:4,drink:true}
]);
const recipeFor=id=>RECIPES.find(recipe=>recipe.id===id)||null;
export class Kitchen {
 constructor({shared,playerId='local-owner',onThirst=null,onHunger=null,message=null,boilSeconds=BOIL_SECONDS,useDelayMs=USE_DELAY_MS}={}){
  if(!shared)throw new TypeError('Kitchen requires the shared world');
  Object.assign(this,{shared,playerId,onThirst,onHunger,message,boilSeconds,useDelayMs});
  // When this moment passes the water is clean; null means nothing is on the fire.
  this.boilUntil=null;
  // The vessel to put away once the beat has passed, and the last clock we saw.
  this.unequipTool=null;
  this.unequipAt=null;
  this.now=Date.now();
 }
 get inventory(){return this.shared.getInventory(this.playerId);}
 // What is in the pot: 'raw', 'clean', a dish id, or null when it is empty.
 get pot(){const contents=this.inventory.pot;return POT_STATES.includes(contents)?contents:null;}
 // The dish in the pot, with its name and what a serving is worth; null otherwise.
 get meal(){return recipeFor(this.pot);}
 get mealName(){return this.meal?.name||'';}
 // How many servings of a meal are left to eat; zero for water, tea and an empty pot.
 get servings(){return EATEN_STATES.includes(this.pot)?Math.max(0,this.inventory.potServings||0):0;}
 // Clean water is served the same way, a cup at a time.
 get waterServings(){return this.pot==='clean'?Math.max(0,this.inventory.potServings||0):0;}
 // And so is tea.
 get teaServings(){return this.pot==='tea'?Math.max(0,this.inventory.potServings||0):0;}
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
 // A used vessel is put away on this clock rather than in the same instant, so the
 // hand holds it for a beat. Only the vessel that was used comes out, never whatever
 // the player has picked up since.
 afterUse(now=this.now){
  this.unequipTool=this.shared.getEquippedTool(this.playerId);
  this.unequipAt=now+this.useDelayMs;
 }
 update(now=Date.now(),{atFire=false}={}){
  this.now=now;
  if(this.unequipAt!==null&&now>=this.unequipAt){
   const tool=this.unequipTool;
   this.unequipAt=null;this.unequipTool=null;
   if(!tool||this.shared.getEquippedTool(this.playerId)===tool)this.shared.setEquippedTool(this.playerId,null);
  }
  if(this.boilUntil){
   if(now<this.boilUntil)return false;
   this.boilUntil=null;
   this.write({pot:'clean',potServings:SERVINGS_PER_POT});
   // Clean water is the end of the pot's job, so it is put away after the beat.
   this.afterUse(now);
   this.say('The water boils and clears.');
   return true;
  }
  if(!atFire)return false;
  if(this.shared.getEquippedTool(this.playerId)!=='pot')return false;
  return this.boil(now);
 }
 // The cup drinks clean water and the tea made from it, one serving at a time.
 canDrink(){return (this.waterServings>0||this.teaServings>0)&&this.has('cup');}
 drink(){
  // The dish is read before the serving is taken: the last cup empties the pot.
  const tea=this.pot==='tea'?this.meal:null;
  if(!this.canDrink())return false;
  const left=(tea?this.teaServings:this.waterServings)-1;
  // The last serving empties the pot; until then the rest keeps in it.
  this.write(left>0?{potServings:left}:{pot:null,potServings:0});
  this.afterUse();
  this.onThirst?.(tea?.restores);
  this.say(tea
   ?(left>0?'You drink a cup of dandy tea. '+left+' left in the pot.':'You drink the last of the tea.')
   :(left>0?'You drink a cup of water. '+left+' left in the pot.':'You drink the last of the water.'));
  return true;
 }
 canMake(recipe){
  if(!recipe||this.pot!==(recipe.base??null))return false;
  const inventory=this.inventory;
  return Object.entries(recipe.needs).every(([item,count])=>(inventory[item]||0)>=count);
 }
 // Only what can be made right now is offered: an option the pack cannot cover
 // is not an option. A dish that needs no cooking is offered away from the fire
 // too, which is what makes it the first meal of a camp.
 recipes(atFire=true){return RECIPES.filter(recipe=>this.canMake(recipe)&&(atFire||recipe.cold));}
 cook(id){
  const recipe=recipeFor(id);
  if(!this.canMake(recipe))return false;
  const inventory=this.inventory;
  // The water the dish was made in, or the empty pot the salad went into, becomes
  // the dish itself, served out of the same pot.
  const patch={pot:recipe.id,potServings:SERVINGS_PER_POT};
  for(const [item,count] of Object.entries(recipe.needs))patch[item]=(inventory[item]||0)-count;
  this.write(patch);
  // The dish stays in the pot, which is where it keeps, and the pot is put away
  // after the beat like any other used vessel.
  this.say('You make '+recipe.name.toLowerCase()+'.');
  return true;
 }
 // A bowl is what a meal is eaten from, one serving at a time out of the pot.
 canEat(){return this.servings>0&&this.has('bowl');}
 eat(){
  const meal=this.meal;
  if(!this.canEat())return false;
  const left=this.servings-1;
  // The last serving empties the pot; until then the rest keeps in it.
  this.write(left>0?{potServings:left}:{pot:null,potServings:0});
  this.afterUse();
  this.onHunger?.(meal.restores);
  this.say(left>0?'You eat a bowl of '+meal.name.toLowerCase()+'. '+left+' left in the pot.'
   :'You eat the last of the '+meal.name.toLowerCase()+'.');
  return true;
 }
}
