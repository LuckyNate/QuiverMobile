import test from 'node:test';
import assert from 'node:assert/strict';
import {SharedWorld} from '../../src/engine/entity/shared-world.js';
import {Kitchen,BOIL_SECONDS} from '../../src/engine/camp/kitchen.js';

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
 const eaten={thirst:0,hunger:0,said:[]};
 const kitchen=new Kitchen({shared,playerId:'p',
  onThirst:()=>{eaten.thirst++;},onHunger:()=>{eaten.hunger++;},
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
 assert.equal(shared.getEquippedTool('p'),null,'the cleared pot leaves the hand');
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
 stock(shared,{dandies:1});
 kitchen.fill();
 assert.deepEqual(kitchen.recipes(),[],'raw water is not soup');
 sitAtFire(kitchen);
 assert.deepEqual(kitchen.recipes(),[],'no meat, no options');
 stock(shared,{rawBacon:1});
 assert.deepEqual(kitchen.recipes().map(recipe=>recipe.id),['soup']);
 stock(shared,{craftedTools:['pot','cup']});
 assert.deepEqual(kitchen.recipes(),[],'no bowl, no soup');
 stock(shared,{craftedTools:['pot','cup','bowl']});
 assert.equal(kitchen.recipes().length,1);
});

test('cooking spends the water and the ingredients into the bowl',()=>{
 const {shared,kitchen,eaten}=setup();
 stock(shared,{dandies:2,rawBacon:1});
 kitchen.fill();
 sitAtFire(kitchen);
 assert.equal(kitchen.cook('soup'),true);
 const inventory=shared.getInventory('p');
 assert.deepEqual({dandies:inventory.dandies,rawBacon:inventory.rawBacon,soup:kitchen.soup,pot:kitchen.pot},
  {dandies:1,rawBacon:0,soup:1,pot:null});
 assert.equal(shared.getEquippedTool('p'),null,'the empty pot leaves the hand');
 assert.equal(kitchen.cook('soup'),false,'no water left to cook with');
 assert.equal(kitchen.eat(),true);
 assert.equal(kitchen.soup,0);
 assert.equal(eaten.hunger,1);
 assert.equal(kitchen.eat(),false,'an empty bowl is not eaten');
});

test('clean water is drunk straight from the pot',()=>{
 const {shared,kitchen,eaten}=setup();
 stock(shared,{craftedTools:['pot']});
 kitchen.fill();
 sitAtFire(kitchen);
 assert.equal(kitchen.canDrink(),true,'no cup needed: the pot is the cup');
 assert.equal(kitchen.drink(),true);
 assert.equal(kitchen.pot,null);
 assert.equal(eaten.thirst,1);
 assert.equal(shared.getEquippedTool('p'),null,'the empty pot leaves the hand');
 assert.equal(kitchen.canDrink(),false,'an empty pot holds nothing to drink');
});

test('a pot left on the fire is not boiled twice',()=>{
 const {kitchen}=setup();
 kitchen.fill();
 assert.equal(kitchen.update(1000,{atFire:true}),true);
 assert.equal(kitchen.update(1000,{atFire:true}),false,'already on the fire');
 kitchen.update(1000+BOIL_SECONDS*1000,{atFire:true});
 assert.equal(kitchen.pot,'clean');
 assert.equal(kitchen.update(1000+BOIL_SECONDS*2000,{atFire:true}),false,'nothing left to boil');
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
