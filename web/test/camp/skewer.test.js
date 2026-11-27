import test from 'node:test';
import assert from 'node:assert/strict';
import {SharedWorld} from '../../src/engine/entity/shared-world.js';
import {Kitchen} from '../../src/engine/camp/kitchen.js';

// The skewer is the one thing cooked with that is not a vessel: it is two sticks, it
// lists the meats in the pack, and it is spent cooking one of them.
function memoryStorage(){
 const data=new Map();
 return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
}
function setup(){
 const shared=new SharedWorld({storage:memoryStorage(),ownerId:'p',seed:'QuiverGL'});
 shared.join('p',{x:0,y:0,z:0});
 const eaten={points:[],said:[]};
 const kitchen=new Kitchen({shared,playerId:'p',
  onHunger:(points,rich)=>eaten.points.push(['hunger',points??null,Boolean(rich)]),
  message:text=>eaten.said.push(text)});
 return {shared,kitchen,eaten};
}
const stock=(shared,patch)=>shared.updateInventory('p',patch);

test('a skewer is made of two sticks and a camp is not given one',()=>{
 const {shared}=setup();
 assert.equal(shared.hasTool('p','skewer'),false,'the skewer is earned');
 stock(shared,{sticks:1});
 assert.equal(shared.canCraftTool('p','skewer'),false,'one stick is not a skewer');
 stock(shared,{sticks:2});
 assert.equal(shared.craftTool('p','skewer'),true);
 assert.equal(shared.getInventory('p').sticks,0,'the sticks went into it');
 assert.equal(shared.hasTool('p','skewer'),true);
});

test('a skewer lists the meats in the pack and is spent cooking one',()=>{
 const {shared,kitchen}=setup();
 stock(shared,{rawBacon:2,craftedTools:['pot','pan','skewer']});
 shared.setEquippedTool('p','skewer');
 // Nothing is offered away from the fire; at one, the meats in the pack are the menu.
 assert.deepEqual(kitchen.recipes(false,'skewer'),[],'a skewer needs the fire');
 assert.deepEqual(kitchen.recipes(true,'skewer').map(recipe=>recipe.id),['skewered']);
 assert.deepEqual(kitchen.recipes(true,'pot'),[],'meat does not go in the pot');
 assert.equal(kitchen.cook('skewered'),true);
 const inventory=shared.getInventory('p');
 assert.equal(inventory.rawBacon,1,'the meat went onto the stick');
 assert.equal(inventory.skewered,1,'cooked meat is carried, not served out of anything');
 assert.equal(inventory.skewer,undefined,'a skewer holds nothing: it is spent');
 assert.equal(shared.hasTool('p','skewer'),false,'the stick is gone');
 assert.equal(shared.getEquippedTool('p'),null,'and it leaves the hand with it');
 // It is eaten from the pack, with no bowl and no vessel to empty.
 assert.equal(shared.hasTool('p','bowl'),false);
 assert.equal(kitchen.canEat(),false,'a carried skewer is not a bowl of anything');
 assert.equal(kitchen.eatCarried(),true);
 assert.deepEqual(kitchen.recipes(true,'skewer'),[],'one skewer is one piece of meat');
 assert.equal(shared.getInventory('p').skewered,0,'and the meat is gone with it');
 assert.equal(kitchen.eatCarried(),false,'nothing left to eat');
});
