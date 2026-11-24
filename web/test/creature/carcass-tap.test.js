import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ResourceHandler} from '../../src/engine/resource/resource-handler.js';

const BOAR='F06:boar:0:0:0',TREE='F06:tree:0:0:0',GRASS='F06:grass:0:0:0';
const AT=new THREE.Vector3(0,0,210);

// The touch rule lives in one handler method, so it can be exercised against a
// hand-built host: what was tapped, what is in hand, and where the avatar is.
function fixture(tool,{metres=0,dead=true}={}){
 const events=[];
 const host={
  tool,
  playerId:'local-owner',
  player:{position:AT.clone().addScaledVector(new THREE.Vector3(1,0,0),metres)},
  shared:{getEquippedTool(){return host.tool;}},
  creatures:{
   get:id=>id===BOAR?{id:BOAR,dead,at:AT}:null,
   harvest:id=>{events.push(['harvest',id]);return {};},
   strike:id=>{events.push(['strike',id]);return {damage:1,killed:false};},
   combat:{weapon:name=>['club','knife','bow'].includes(name)?{reach:2.2}:null}
  },
  findTree:id=>id===TREE?{id:TREE,at:AT,state:'standing'}:null,
  fell:()=>{events.push(['fell']);},
  grass:{
   clumps:new Map([[GRASS,{id:GRASS,position:AT,state:'standing'}]]),
   cut:()=>{events.push(['cut']);}
  }
 };
 const tap=(type,id)=>({
  acted:ResourceHandler.prototype.tapNow.call(host,type,id),
  events:[...events]
 });
 return {tap,events,setTool:tool=>{host.tool=tool;}};
}

test('a touch acts on the spot, with the tool in hand and in reach',()=>{
 const f=fixture('knife');
 assert.deepEqual(f.tap('boar',BOAR),{acted:true,events:[['harvest',BOAR]]});
 const club=fixture('club',{dead:false});
 assert.deepEqual(club.tap('boar',BOAR),{acted:true,events:[['strike',BOAR]]});
 const axe=fixture('axe');
 assert.deepEqual(axe.tap('tree',TREE),{acted:true,events:[['fell']]});
 const scythe=fixture('scythe');
 assert.deepEqual(scythe.tap('grass',GRASS),{acted:true,events:[['cut']]});
});

test('the wrong tool or too far away does nothing at all',()=>{
 const club=fixture('club');
 assert.deepEqual(club.tap('boar',BOAR),{acted:false,events:[]});   // no knife on a carcass
 assert.deepEqual(club.tap('tree',TREE),{acted:false,events:[]});   // no axe
 assert.deepEqual(club.tap('grass',GRASS),{acted:false,events:[]}); // no scythe
 const far=fixture('knife',{metres:5});
 assert.deepEqual(far.tap('boar',BOAR),{acted:false,events:[]});
 const bare=fixture(null);
 assert.deepEqual(bare.tap('boar',BOAR),{acted:false,events:[]});
});

// The reported bug in one line: drawing a tool later must not set anything off.
test('changing what is in hand never fires an earlier touch',()=>{
 const f=fixture('club');
 f.tap('boar',BOAR);          // a tap that could not work at the time
 f.setTool('knife');          // knife drawn while standing over the carcass
 assert.deepEqual(f.events,[]); // nothing runs on its own: no input is armed
 assert.deepEqual(f.tap('boar',BOAR),{acted:true,events:[['harvest',BOAR]]});
});

test('nothing in the input path remembers a tap target',()=>{
 for(const name of ['tapGather','clearTapGather','gatherTapTarget','tapTarget'])
  assert.equal(ResourceHandler.prototype[name],undefined,`${name} must not exist`);
});
