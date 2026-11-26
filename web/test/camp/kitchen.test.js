import test from 'node:test';
import assert from 'node:assert/strict';
import {SharedWorld} from '../../src/engine/entity/shared-world.js';
import {Kitchen} from '../../src/engine/camp/kitchen.js';

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
 const eaten={thirst:0,hunger:0,said:[]};
 const kitchen=new Kitchen({shared,playerId:'p',
  onThirst:()=>{eaten.thirst++;},onHunger:()=>{eaten.hunger++;},
  message:text=>eaten.said.push(text)});
 return {shared,kitchen,eaten,storage};
}
const stock=(shared,patch)=>shared.updateInventory('p',patch);

test('every camp starts with its cookware',()=>{
 const {shared}=setup();
 for(const tool of ['cup','pot','bowl'])assert.equal(shared.hasTool('p',tool),true,tool);
 assert.equal(shared.hasTool('p','axe'),false,'the rest is still earned');
});

test('pot water goes spring-raw, fire-clean, cup-drunk',()=>{
 const {kitchen,eaten}=setup();
 assert.equal(kitchen.pot,null);
 assert.equal(kitchen.canDrink(),false);
 assert.equal(kitchen.fill(),true);
 assert.equal(kitchen.pot,'raw');
 assert.equal(kitchen.canDrink(),false,'raw water is never drunk');
 assert.equal(kitchen.drink(),false);
 assert.equal(kitchen.boil(),true);
 assert.equal(kitchen.pot,'clean');
 assert.equal(kitchen.drink(),true);
 assert.equal(kitchen.pot,null);
 assert.equal(eaten.thirst,1);
 assert.deepEqual(eaten.said,['You fill the pot with spring water.','The water boils and clears.','You drink the boiled water.']);
});

test('a pot that already holds water is not filled again',()=>{
 const {kitchen}=setup();
 assert.equal(kitchen.fill(),true);
 assert.equal(kitchen.canFill(),false);
 assert.equal(kitchen.fill(),false);
 assert.equal(kitchen.pot,'raw');
 assert.equal(kitchen.boil(),true);
 assert.equal(kitchen.canFill(),false,'clean water still fills the pot');
 assert.equal(kitchen.boil(),false,'and is not boiled twice');
});

test('soup takes clean water, dandies, meat and a bowl',()=>{
 const {shared,kitchen,eaten}=setup();
 stock(shared,{dandies:2,rawBacon:1});
 kitchen.fill();
 assert.equal(kitchen.canCookSoup(),false,'raw water is not soup');
 kitchen.boil();
 assert.equal(kitchen.canCookSoup(),true);
 stock(shared,{craftedTools:['pot','cup']});
 assert.equal(kitchen.canCookSoup(),false,'no bowl, no soup');
 stock(shared,{craftedTools:['pot','cup','bowl']});
 assert.equal(kitchen.cookSoup(),true);
 const inventory=shared.getInventory('p');
 assert.deepEqual({dandies:inventory.dandies,rawBacon:inventory.rawBacon,soup:kitchen.soup,pot:kitchen.pot},
  {dandies:1,rawBacon:0,soup:1,pot:null});
 assert.equal(kitchen.eat(),true);
 assert.equal(kitchen.soup,0);
 assert.equal(eaten.hunger,1);
 assert.equal(kitchen.eat(),false,'an empty bowl is not eaten');
});

test('a pot without a cup is boiled but not drunk from',()=>{
 const {shared,kitchen}=setup();
 stock(shared,{craftedTools:['pot']});
 kitchen.fill();
 kitchen.boil();
 assert.equal(kitchen.pot,'clean');
 assert.equal(kitchen.canDrink(),false);
 assert.equal(kitchen.drink(),false);
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
