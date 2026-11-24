import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ResourceHandler} from '../../src/engine/resource/resource-handler.js';

const ID='F06:boar:0:0:0';
const AT=new THREE.Vector3(0,0,210);

// The tap rule lives in one handler method, so it can be exercised against a
// hand-built host: a tapped carcass, a tool in hand, and the avatar's position.
function tapCarcass(tool,{metres=0,dead=true}={}){
 const harvested=[];
 const boar={id:ID,dead,at:AT};
 const handler={
  playerId:'local-owner',
  player:{position:AT.clone().addScaledVector(new THREE.Vector3(1,0,0),metres)},
  shared:{getEquippedTool:()=>tool},
  creatures:{
   get:id=>id===ID?boar:null,
   harvest:id=>{harvested.push(id);return {rawBacon:1,hide:1,tusks:2};}
  }
 };
 const opened=ResourceHandler.prototype.tapCarcass.call(handler,ID);
 return {opened,harvested};
}

test('the tap itself loots the carcass, with the knife already in hand',()=>{
 assert.deepEqual(tapCarcass('knife'),{opened:true,harvested:[ID]});
 assert.deepEqual(tapCarcass('club').harvested,[]);   // wrong tool: nothing
 assert.deepEqual(tapCarcass(null).harvested,[]);     // bare hands: nothing
});

test('the knife only reaches a carcass you are standing at',()=>{
 assert.deepEqual(tapCarcass('knife',{metres:5}),{opened:false,harvested:[]});
 assert.deepEqual(tapCarcass('knife',{metres:1.2}).harvested,[ID]);
});

test('a living boar is never looted, whatever is in hand',()=>{
 assert.deepEqual(tapCarcass('knife',{dead:false}),{opened:false,harvested:[]});
});

// The reported bug: a tap remembered from earlier should never turn into loot
// just because a knife got equipped afterwards.
test('a remembered tap cannot loot a carcass, even with the knife out',()=>{
 const harvested=[];
 const boar={id:ID,dead:true,at:AT};
 const handler={
  tapTarget:{type:'boar',id:ID},
  playerId:'local-owner',
  shared:{getEquippedTool:()=>'knife'},
  creatures:{get:()=>boar,harvest:id=>{harvested.push(id);},
   strike:()=>{throw new Error('a carcass is not struck');},combat:{weapon:()=>({reach:2.2})}},
  clearTapGather(){this.tapTarget=null;},
  findTree:()=>null,
  grass:{clumps:new Map()}
 };
 const body={getPosition:()=>({x:AT.x,y:AT.y,z:AT.z})};
 ResourceHandler.prototype.gatherTapTarget.call(handler,body);
 assert.deepEqual(harvested,[]);
 assert.equal(handler.tapTarget,null);   // and the stale target is dropped
});

test('a tap on a live boar is an attack, not a harvest',()=>{
 const struck=[];
 const boar={id:ID,dead:false,at:AT};
 const handler={
  tapTarget:{type:'boar',id:ID},
  playerId:'local-owner',
  shared:{getEquippedTool:()=>'club'},
  creatures:{get:()=>boar,harvest:()=>{throw new Error('no harvest');},
   strike:id=>{struck.push(id);return {damage:1,killed:false};},
   combat:{weapon:()=>({reach:2.2})}},
  clearTapGather(){this.tapTarget=null;},
  findTree:()=>null,
  grass:{clumps:new Map()}
 };
 const body={getPosition:()=>({x:AT.x,y:AT.y,z:AT.z})};
 ResourceHandler.prototype.gatherTapTarget.call(handler,body);
 assert.deepEqual(struck,[ID]);
});
