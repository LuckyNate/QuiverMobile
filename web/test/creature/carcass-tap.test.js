import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ResourceHandler} from '../../src/engine/resource/resource-handler.js';

const ID='F06:boar:0:0:0';
const AT=new THREE.Vector3(0,0,210);

// The tap rule lives in one handler method, so it can be exercised against a
// hand-built host: a tapped carcass, a tool in hand, and an avatar position.
function tap(tool,{metres=0,dead=true}={}){
 const harvested=[],struck=[];
 const boar={id:ID,dead,at:AT};
 const handler={
  tapTarget:{type:'boar',id:ID},
  playerId:'local-owner',
  shared:{getEquippedTool:()=>tool},
  creatures:{
   get:id=>id===ID?boar:null,
   harvest:id=>{harvested.push(id);return {rawBacon:1,hide:1,tusks:2};},
   strike:id=>{struck.push(id);return {damage:1,killed:false};},
   combat:{weapon:name=>name==='club'||name==='knife'?{reach:2.2}:null}
  },
  clearTapGather(){this.tapTarget=null;},
  findTree:()=>null,
  grass:{clumps:new Map()}
 };
 const away=AT.clone().addScaledVector(new THREE.Vector3(1,0,0),metres);
 const body={getPosition:()=>({x:away.x,y:away.y,z:away.z})};
 ResourceHandler.prototype.gatherTapTarget.call(handler,body);
 return {harvested,struck,armed:()=>Boolean(handler.tapTarget)};
}

test('a tap on a carcass only loots it with the knife in hand',()=>{
 assert.deepEqual(tap('knife').harvested,[ID]);
 assert.deepEqual(tap('club').harvested,[]);      // wrong tool: nothing, tap spent
 assert.deepEqual(tap(null).harvested,[]);        // bare hands: nothing either
});

test('the knife only reaches the carcass it was tapped at',()=>{
 const far=tap('knife',{metres:5});
 assert.deepEqual(far.harvested,[]);
 assert.equal(far.armed(),true);                  // still walking over to it
 assert.deepEqual(tap('knife',{metres:1.2}).harvested,[ID]);
});

test('a tap on a live boar is an attack, not a harvest',()=>{
 const living=tap('knife',{dead:false});
 assert.deepEqual(living.harvested,[]);
 assert.deepEqual(living.struck,[ID]);
});
