// Cooking: what the vessels hold and what can be made in them. The fire itself is
// not here — whether there is a burning fire to cook on is the world's question,
// asked before any of this runs. These rules only need the pack and the vessels in
// it, so they are testable without a renderer, a scene or a fire.
//
// Two vessels cook. The pot carries salt water, boils it clean, and holds the dishes
// made with it — salad, soup, tea. The pan fries meat and holds nothing else, so a
// steak and a stew never have to share a pot. Each vessel holds one thing at a time,
// served out in portions, and what it holds sits in the inventory beside everything
// else carried. Raw water is never drunk, the cup drinks water and tea, and the bowl
// eats a meal. What a vessel can do is offered over the vessel itself.
export const VESSELS=Object.freeze(['pot','pan']);
// Everything a vessel can be holding. Raw and clean water are the pot's alone.
export const POT_STATES=Object.freeze(['raw','clean','soup','salad','tea','grilled']);
// What is eaten from a bowl. Tea is the same kind of serving but drunk from a cup.
export const EATEN_STATES=Object.freeze(['soup','salad','grilled']);
// Sitting at a fire with salt water in the pot is the whole of boiling: the fire
// does the work over this long, and nobody has to tap anything to make it happen.
export const BOIL_SECONDS=45;
// A full vessel holds this many servings of what is in it, water or dish. The vessel
// is where it keeps; a cup drinks a serving and a bowl eats one, one at a time.
export const SERVINGS_PER_POT=2;
// How long a vessel stays in the hand after it has been used. It is a beat, not a
// rule: the hand keeps the cup or the bowl just long enough to be seen putting it
// away, which is where the animation goes later.
export const USE_DELAY_MS=700;
// What can be made in a vessel. A recipe says which vessel it belongs in, what that
// vessel must already hold (`base`, null for an empty one), what it takes (resources
// by the count, or a serving of another dish), how many points of its meter one
// serving puts back, whether it is eaten with the bowl or drunk from the cup, and
// whether it is a rich enough dish to fill a meter past its brim. The kitchen only
// ever offers the ones the pack can actually cover.
export const RECIPES=Object.freeze([
 // A salad is the first meal of a camp: dandies picked on the way home and no fire
 // at all, so hunger can be answered before the first log is cut. Lean food: it
 // fills the belly to the brim and no further.
 {id:'salad',name:'Dandy salad',vessel:'pot',needs:{dandies:2},base:null,cold:true,restores:2},
 // Soup and tea both start from water already boiled clean, and both are worth more
 // than their points: they fill the meter past full, and the surplus drains away
 // slowly instead of being wasted. A soup wants meat in it, and the meat has to be
 // cooked already: a serving of the pan's grilled meat, not a raw strip.
 {id:'soup',name:'Dandy soup',vessel:'pot',needs:{dandies:3,grilled:1},base:'clean',restores:4,rich:true},
 {id:'tea',name:'Dandy tea',vessel:'pot',needs:{dandies:1},base:'clean',restores:4,drink:true,rich:true},
 // The pan is for meat. It takes no water, so it goes straight onto the fire, and
 // what comes out of it is rich: fat carries a belly further than dandies do.
 {id:'grilled',name:'Grilled meat',vessel:'pan',needs:{rawBacon:1},base:null,restores:4,rich:true}
]);
const recipeFor=id=>RECIPES.find(recipe=>recipe.id===id)||null;
// A dish can be an ingredient as well as a meal, which is how the pan's meat ends up
// in the pot's soup.
const asDish=id=>RECIPES.some(recipe=>recipe.id===id);
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
 // What a vessel is holding: 'raw', 'clean', a dish id, or null when it is empty.
 contentsOf(vessel){const contents=this.inventory[vessel];return POT_STATES.includes(contents)?contents:null;}
 // How many servings of a dish are left to eat from a vessel; zero for water, tea
 // and an empty vessel.
 servingsOf(vessel){
  const contents=this.contentsOf(vessel);
  return EATEN_STATES.includes(contents)?Math.max(0,this.inventory[vessel+'Servings']||0):0;
 }
 get pot(){return this.contentsOf('pot');}
 get pan(){return this.contentsOf('pan');}
 // What a named vessel holds, as a recipe: the dish in it, tea, or nothing.
 dishIn(vessel){const contents=this.contentsOf(vessel);return recipeFor(contents);}
 // The vessel holding something the bowl can eat, the pot first. One meal is eaten
 // at a time, and the rest keeps where it is.
 get mealVessel(){return VESSELS.find(vessel=>this.servingsOf(vessel)>0)||null;}
 // The dish in that vessel, with its name and what a serving is worth.
 get meal(){return recipeFor(this.mealVessel?this.contentsOf(this.mealVessel):null);}
 get mealName(){return this.meal?.name||'';}
 get servings(){return this.mealVessel?this.servingsOf(this.mealVessel):0;}
 // Clean water is served the same way, a cup at a time.
 get waterServings(){return this.pot==='clean'?Math.max(0,this.inventory.potServings||0):0;}
 // And so is tea, which only the pot steeps.
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
 // How far the boil has got, 0 at the fire and 1 when it is done, for a timer shown
 // as a filling label rather than as a number of seconds.
 boilProgress(now=Date.now()){
  if(!this.boilUntil)return 0;
  return Math.min(1,Math.max(0,1-this.boilLeft(now)/this.boilSeconds));
 }
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
  const tea=this.pot==='tea'?this.dishIn('pot'):null;
  if(!this.canDrink())return false;
  const left=(tea?this.teaServings:this.waterServings)-1;
  // The last serving empties the pot; until then the rest keeps in it.
  this.write(left>0?{potServings:left}:{pot:null,potServings:0});
  this.afterUse();
  this.onThirst?.(tea?.restores,Boolean(tea?.rich));
  this.say(tea
   ?(left>0?'You drink a cup of dandy tea. '+left+' left in the pot.':'You drink the last of the tea.')
   :(left>0?'You drink a cup of water. '+left+' left in the pot.':'You drink the last of the water.'));
  return true;
 }
 // The vessel, if any, holding at least this many servings of a dish. Meat in the pan
 // is what a soup is made with, so ingredients are looked for in the vessels first.
 dishVessel(dish,count=1){
  return VESSELS.find(vessel=>this.contentsOf(vessel)===dish&&this.servingsOf(vessel)>=count)||null;
 }
 canMake(recipe){
  if(!recipe)return false;
  const vessel=recipe.vessel||'pot';
  // The vessel has to be in the pack and holding exactly what this dish starts from:
  // an empty pan for meat, clean water for soup.
  if(!this.has(vessel))return false;
  if(this.contentsOf(vessel)!==(recipe.base??null))return false;
  const inventory=this.inventory;
  return Object.entries(recipe.needs).every(([item,count])=>
   asDish(item)?Boolean(this.dishVessel(item,count)):(inventory[item]||0)>=count);
 }
 // Only what can be made right now is offered: an option the pack cannot cover
 // is not an option. A dish that needs no cooking is offered away from the fire
 // too, which is what makes it the first meal of a camp. Naming a vessel asks only
 // that vessel, which is how the pan offers its meat and the pot its water.
 recipes(atFire=true,vessel=null){
  return RECIPES.filter(recipe=>
   (!vessel||(recipe.vessel||'pot')===vessel)&&this.canMake(recipe)&&(atFire||recipe.cold));
 }
 cook(id){
  const recipe=recipeFor(id);
  if(!this.canMake(recipe))return false;
  const vessel=recipe.vessel||'pot';
  const inventory=this.inventory;
  const patch={};
  for(const [item,count] of Object.entries(recipe.needs)){
   // A dish ingredient is spent out of the vessel holding it, serving by serving.
   if(asDish(item)){
    const from=this.dishVessel(item,count);
    const left=this.servingsOf(from)-count;
    patch[from+'Servings']=Math.max(0,left);
    if(left<=0)patch[from]=null;
    continue;
   }
   patch[item]=(inventory[item]||0)-count;
  }
  // The water the dish was made in, or the empty vessel it went into, becomes the
  // dish itself, served out of the same vessel. Written last, so a vessel that gave
  // up its last serving still ends up holding what was just made in it.
  patch[vessel]=recipe.id;patch[vessel+'Servings']=SERVINGS_PER_POT;
  this.write(patch);
  // The dish stays in its vessel, which is where it keeps, and the vessel is put
  // away after the beat like any other used one.
  this.say('You make '+recipe.name.toLowerCase()+'.');
  return true;
 }
 // A bowl is what a meal is eaten from, one serving at a time out of its vessel.
 canEat(){return this.servings>0&&this.has('bowl');}
 eat(){
  const vessel=this.mealVessel;
  const meal=this.meal;
  if(!this.canEat())return false;
  const left=this.servings-1;
  // The last serving empties the vessel; until then the rest keeps in it.
  this.write(left>0?{[vessel+'Servings']:left}:{[vessel]:null,[vessel+'Servings']:0});
  this.afterUse();
  this.onHunger?.(meal.restores,Boolean(meal.rich));
  this.say(left>0?'You eat a bowl of '+meal.name.toLowerCase()+'. '+left+' left in the '+vessel+'.'
   :'You eat the last of the '+meal.name.toLowerCase()+'.');
  return true;
 }
}
