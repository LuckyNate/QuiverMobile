import test from 'node:test';
import assert from 'node:assert/strict';
import {SharedWorld} from '../../src/engine/entity/shared-world.js';
import {Kitchen} from '../../src/engine/camp/kitchen.js';

// The skewer is the one vessel nobody is given: it is two sticks and a knife's work
// of whittling, so these tests start from an empty camp and make one.
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

test('meat on a skewer is cooked at a fire and eaten off the stick',()=>{
 const {shared,kitchen,eaten}=setup();
 stock(shared,{rawBacon:1,craftedTools:['pot','pan','skewer']});
 assert.deepEqual(kitchen.recipes(false,'skewer'),[],'a skewer needs the fire');
 assert.deepEqual(kitchen.recipes(true,'skewer').map(recipe=>recipe.id),['skewered']);
 assert.deepEqual(kitchen.recipes(true,'pot'),[],'meat does not go in the pot');
 assert.equal(kitchen.cook('skewered'),true);
 assert.equal(shared.getInventory('p').skewer,'skewered');
 assert.equal(kitchen.servingsOf('skewer'),1,'a skewer holds the one piece on it');
 // No bowl in the pack: the stick is what it is eaten off.
 assert.equal(shared.hasTool('p','bowl'),false);
 assert.equal(kitchen.canEat(),true,'a skewer needs no bowl');
 assert.equal(kitchen.eat(),true);
 assert.deepEqual(eaten.points,[['hunger',4,true]],'skewered meat is as rich as grilled');
 assert.equal(shared.getInventory('p').skewer,null,'the stick is empty again');
 assert.equal(kitchen.eat(),false,'and there is nothing left on it');
});
