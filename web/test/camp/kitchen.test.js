import test from 'node:test';
import assert from 'node:assert/strict';
import {SharedWorld} from '../../src/engine/entity/shared-world.js';
import {Kitchen,BOIL_SECONDS,USE_DELAY_MS} from '../../src/engine/camp/kitchen.js';

// The kitchen needs a pack and nothing else — no fire, no scene, no renderer — so
// the real SharedWorld runs under node against memory storage.
function memoryStorage(){
 const data=new Map();
 return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
}
function setup(){
 const storage=memoryStorage();
 const shared=new SharedWorld({storage,ownerId:'p',seed:'QuiverGL'});
 shared.join('p',{x:0,y:0,z:0});
 // The pot is in hand at the sea, which is the only way it is ever filled.
 shared.setEquippedTool('p','pot');
 const eaten={thirst:0,hunger:0,points:[],said:[]};
 const kitchen=new Kitchen({shared,playerId:'p',
  // What the kitchen tells the meters, and how much of it.
  onThirst:points=>{eaten.thirst++;eaten.points.push(['thirst',points??null]);},
  onHunger:points=>{eaten.hunger++;eaten.points.push(['hunger',points??null]);},
  message:text=>eaten.said.push(text)});
 return {shared,kitchen,eaten,storage};
}
const stock=(shared,patch)=>shared.updateInventory('p',patch);
// Sitting at a burning fire for as long as the boil takes.
const sitAtFire=(kitchen,now=1000)=>{
 kitchen.update(now,{atFire:true});
 kitchen.update(now+BOIL_SECONDS*1000,{atFire:true});
};

test('every camp starts with its cookware',()=>{
 const {shared}=setup();
 for(const tool of ['cup','pot','bowl'])assert.equal(shared.hasTool('p',tool),true,tool);
 assert.equal(shared.hasTool('p','axe'),false,'the rest is still earned');
});

test('a fire boils the pot on its own clock and the clean pot leaves the hand',()=>{
 const {shared,kitchen,eaten}=setup();
 assert.equal(kitchen.pot,null);
 kitchen.fill();
 assert.equal(kitchen.pot,'raw');
 assert.equal(shared.getInventory('p').pot,'raw','the pot carries its own contents');
 assert.equal(kitchen.update(1000,{atFire:false}),false,'no fire, no boil');
 assert.equal(kitchen.boiling,false);
 assert.equal(kitchen.update(1000,{atFire:true}),true,'standing at the fire starts it');
 assert.equal(kitchen.boiling,true);
 assert.equal(kitchen.boilLeft(1000),BOIL_SECONDS);
 assert.equal(kitchen.pot,'raw','still salt water while it heats');
 kitchen.update(1000+BOIL_SECONDS*1000-1,{atFire:true});
 assert.equal(kitchen.pot,'raw','not a millisecond early');
 assert.equal(kitchen.update(1000+BOIL_SECONDS*1000,{atFire:true}),true);
 assert.equal(kitchen.pot,'clean');
 assert.equal(kitchen.boiling,false);
 assert.equal(shared.getInventory('p').potServings,2,'a boiled pot is two servings');
 assert.equal(shared.getEquippedTool('p'),'pot','the pot stays for the beat');
 kitchen.update(1000+BOIL_SECONDS*1000+USE_DELAY_MS,{atFire:false});
 assert.equal(shared.getEquippedTool('p'),null,'and is put away after it');
 assert.deepEqual(eaten.said,['You fill the pot with salt water.','You set the pot on the fire.','The water boils and clears.']);
});

test('a pot that already holds water is not filled again',()=>{
 const {kitchen}=setup();
 assert.equal(kitchen.fill(),true);
 assert.equal(kitchen.canFill(),false);
 assert.equal(kitchen.fill(),false);
 assert.equal(kitchen.pot,'raw');
 sitAtFire(kitchen);
 assert.equal(kitchen.pot,'clean');
 assert.equal(kitchen.canFill(),false,'clean water still fills the pot');
});

test('only the recipes the pack can cover are offered',()=>{
 const {shared,kitchen}=setup();
 kitchen.fill();
 assert.deepEqual(kitchen.recipes(),[],'raw water is not a dish');
 sitAtFire(kitchen);
 assert.deepEqual(kitchen.recipes(),[],'no dandies, no options');
 stock(shared,{dandies:1});
 assert.deepEqual(kitchen.recipes().map(recipe=>recipe.id),['tea'],'one dandy steeps a tea');
 stock(shared,{dandies:3});
 assert.deepEqual(kitchen.recipes().map(recipe=>recipe.id),['soup','tea']);
 kitchen.drink();
 kitchen.drink();
 assert.deepEqual(kitchen.recipes().map(recipe=>recipe.id),['salad'],'an empty pot takes a salad');
});

test('a dandy salad is the first meal, made with no fire at all',()=>{
 const {shared,kitchen,eaten}=setup();
 assert.equal(shared.getEquippedTool('p'),'pot');
 assert.deepEqual(kitchen.recipes(false),[],'an empty pack makes nothing');
 stock(shared,{dandies:2});
 assert.deepEqual(kitchen.recipes(false).map(recipe=>recipe.id),['salad'],'a salad needs no fire');
 assert.deepEqual(kitchen.recipes(true).map(recipe=>recipe.id),['salad']);
 assert.equal(kitchen.cook('soup'),false,'no clean water for a soup');
 assert.equal(kitchen.cook('salad'),true);
 const inventory=shared.getInventory('p');
 assert.deepEqual({pot:inventory.pot,dandies:inventory.dandies},{pot:'salad',dandies:0});
 assert.equal(kitchen.servings,2);
 assert.equal(kitchen.canDrink(),false,'a salad is not drunk');
 assert.equal(kitchen.eat(),true);
 assert.deepEqual(eaten.points,[['hunger',2]],'a salad is worth two points of hunger');
 assert.equal(kitchen.servings,1,'the rest keeps in the pot');
});

test('dandy tea is drunk from the cup and is worth more than water',()=>{
 const {shared,kitchen,eaten}=setup();
 kitchen.fill();
 sitAtFire(kitchen);
 stock(shared,{dandies:1});
 assert.deepEqual(kitchen.recipes().map(recipe=>recipe.id),['tea']);
 assert.equal(kitchen.cook('tea'),true);
 assert.equal(kitchen.teaServings,2);
 assert.equal(kitchen.servings,0,'tea is not eaten');
 assert.equal(kitchen.canEat(),false);
 assert.equal(kitchen.waterServings,0,'the water became the tea');
 assert.equal(kitchen.canDrink(),true,'the cup drinks it');
 shared.setEquippedTool('p','cup');
 assert.equal(kitchen.drink(),true);
 assert.equal(kitchen.teaServings,1);
 assert.deepEqual(eaten.points,[['thirst',4]],'tea puts back its own points');
 assert.equal(shared.getEquippedTool('p'),'cup','the cup stays for the beat');
 shared.setEquippedTool('p','cup');
 assert.equal(kitchen.drink(),true);
 assert.equal(kitchen.pot,null,'the last cup empties the pot');
 assert.equal(kitchen.canDrink(),false);
});

test('the meal is cooked into the pot and eaten from it',()=>{
 const {shared,kitchen,eaten}=setup();
 stock(shared,{dandies:4,rawBacon:1});
 kitchen.fill();
 sitAtFire(kitchen);
 // Boiling took the pot out of the hand, so it is taken up again to cook in.
 shared.setEquippedTool('p','pot');
 assert.equal(kitchen.cook('soup'),true);
 const inventory=shared.getInventory('p');
 assert.deepEqual({pot:inventory.pot,dandies:inventory.dandies},
  {pot:'soup',dandies:1},'three dandies go into a soup');
 assert.equal(shared.getEquippedTool('p'),'pot','cooking puts nothing new in the hand');
 assert.equal(inventory.potServings,2,'a full pot is two servings');
 assert.equal(kitchen.canDrink(),false,'soup is not drunk');
 assert.equal(kitchen.cook('soup'),false,'no water left to cook with');
 assert.equal(kitchen.eat(),true);
 assert.equal(kitchen.pot,'soup');
 assert.equal(shared.getInventory('p').potServings,1,'one serving eaten, one left');
 assert.equal(eaten.hunger,1);
 assert.equal(kitchen.eat(),true);
 assert.equal(kitchen.pot,null,'the last serving empties the pot');
 assert.equal(eaten.hunger,2);
 assert.equal(shared.getEquippedTool('p'),'pot','the used vessel stays for the beat');
 kitchen.update(kitchen.now+USE_DELAY_MS,{atFire:false});
 assert.equal(shared.getEquippedTool('p'),null,'and is put away after it');
 assert.equal(kitchen.eat(),false,'an empty pot is not eaten from');
});

test('a bowl is what a meal is eaten from',()=>{
 const {shared,kitchen}=setup();
 stock(shared,{dandies:3});
 kitchen.fill();
 sitAtFire(kitchen);
 kitchen.cook('soup');
 stock(shared,{craftedTools:['pot']});
 assert.equal(kitchen.canEat(),false,'no bowl, nothing to eat it from');
 assert.equal(kitchen.eat(),false);
 assert.equal(shared.getInventory('p').potServings,2,'the pot keeps both servings');
 stock(shared,{craftedTools:['pot','bowl']});
 assert.equal(kitchen.canEat(),true,'the bowl in the pack is enough');
});

test('a cup drinks one serving of clean water at a time',()=>{
 const {shared,kitchen,eaten}=setup();
 kitchen.fill();
 sitAtFire(kitchen);
 stock(shared,{craftedTools:['pot']});
 assert.equal(kitchen.canDrink(),false,'no cup, nothing to drink from');
 stock(shared,{craftedTools:['pot','cup']});
 shared.setEquippedTool('p','cup');
 assert.equal(kitchen.canDrink(),true);
 assert.equal(kitchen.drink(),true);
 assert.equal(shared.getInventory('p').potServings,1,'one cup takes one serving');
 assert.equal(eaten.thirst,1);
 assert.equal(shared.getEquippedTool('p'),'cup','the cup stays for the beat');
 kitchen.update(kitchen.now+USE_DELAY_MS,{atFire:false});
 assert.equal(shared.getEquippedTool('p'),null,'and is put away after it');
 shared.setEquippedTool('p','cup');
 assert.equal(kitchen.drink(),true);
 assert.equal(kitchen.pot,null,'the last serving empties the pot');
 assert.equal(kitchen.canDrink(),false,'an empty pot holds nothing to drink');
});

test('only the vessel that was used is put away',()=>{
 const {shared,kitchen}=setup();
 kitchen.fill();
 sitAtFire(kitchen);
 stock(shared,{craftedTools:['pot','cup','bowl']});
 shared.setEquippedTool('p','cup');
 kitchen.drink();
 // The player picks the pot up before the beat runs out.
 shared.setEquippedTool('p','pot');
 kitchen.update(kitchen.now+USE_DELAY_MS,{atFire:false});
 assert.equal(shared.getEquippedTool('p'),'pot','the pot in hand is not the cup that was used');
});

test('a pot left on the fire is not boiled twice',()=>{
 const {kitchen}=setup();
 kitchen.fill();
 assert.equal(kitchen.update(1000,{atFire:true}),true);
 assert.equal(kitchen.update(1000,{atFire:true}),false,'already on the fire');
 kitchen.update(1000+BOIL_SECONDS*1000,{atFire:true});
 assert.equal(kitchen.pot,'clean');
 assert.equal(kitchen.update(1000+BOIL_SECONDS,{atFire:true}),false,'nothing left to boil');
});

test('what is in the pot survives a reload',()=>{
 const {kitchen,storage}=setup();
 kitchen.fill();
 const reloaded=new SharedWorld({storage,ownerId:'p',seed:'QuiverGL'});
 reloaded.join('p',{x:0,y:0,z:0});
 const again=new Kitchen({shared:reloaded,playerId:'p'});
 assert.equal(again.pot,'raw');
 assert.equal(reloaded.hasTool('p','pot'),true);
});
