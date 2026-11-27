import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GroundResources} from '../../src/engine/resource/ground-resources.js';
import {DANDY_YELLOW_DYE,dyeColor} from '../../src/engine/avatar/dye-palette.js';

// The pickups only need a root, a player position and an id source; none of them
// touch the renderer, so the real classes run under node.
const RADIUS=243.5;
const at=(x,y,z)=>new THREE.Vector3(x,y,z).normalize().multiplyScalar(RADIUS);
function makeGround(shared=null){
 const root=new THREE.Group();
 const ground=new GroundResources({root,shared,player:{position:new THREE.Vector3(0,RADIUS,0)},playerId:'local-owner'});
 return {root,ground};
}

test('a dandy is picked up through the same pipeline as a stick',()=>{
 const {root,ground}=makeGround();
 const dandy=ground.spawn('dandy','d1',at(1,.2,0));
 assert.ok(dandy);
 assert.equal(dandy.type,'dandy');
 assert.equal(dandy.state,'standing');
 assert.equal(dandy.award,'dandies');
 assert.equal(ground.items.get('d1'),dandy);
 assert.equal(root.children.length,1);
 // One flower per slot, like one stick per slot.
 assert.equal(ground.spawn('dandy','d1',at(1,.2,0)),false);
 ground.unload('d1');
 assert.equal(ground.items.has('d1'),false);
 assert.equal(ground.select('d1'),undefined);
});

test('each pickup names the bag slot it fills',()=>{
 const {ground}=makeGround();
 assert.equal(ground.spawn('stick','s',at(1,0,0)).award,'sticks');
 assert.equal(ground.spawn('stone','r',at(2,0,0)).award,'stones');
 assert.equal(ground.spawn('dandy','d',at(3,0,0)).award,'dandies');
});

test('a type with no pickup style is refused rather than half-made',()=>{
 const {root,ground}=makeGround();
 assert.equal(ground.spawn('turnip','t',at(1,0,0)),false);
 assert.equal(ground.items.size,0);
 assert.equal(root.children.length,0);
});

test('the first dandy picked is the yellow dye',()=>{
 const bag={dandies:0,sticks:0},dyes=new Set();
 const shared={
  getEntity:()=>undefined,setEntity:()=>{},
  awardResource:(id,type,count)=>{bag[type]+=count;},
  getUnlockedDyes:()=>[...dyes],
  unlockDye:(id,color)=>{dyes.add(color);return true;}
 };
 const {ground}=makeGround(shared);
 const taught=[];
 ground.onDiscovery=color=>taught.push(color);
 // The swatch is a yellow, not a stray index into the palette.
 assert.equal(dyeColor(DANDY_YELLOW_DYE),'#ffc13d');
 ground.collect(ground.spawn('dandy','d1',at(1,.2,0)));
 assert.equal(bag.dandies,1,'the dandy still fills its slot');
 assert.deepEqual([...dyes],[DANDY_YELLOW_DYE]);
 assert.deepEqual(taught,[DANDY_YELLOW_DYE]);
 // A second dandy is just a dandy: the colour is already known.
 ground.collect(ground.spawn('dandy','d2',at(2,.2,0)));
 assert.equal(bag.dandies,2);
 assert.deepEqual(taught,[DANDY_YELLOW_DYE]);
 // Sticks and stones carry no colour of their own.
 ground.collect(ground.spawn('stick','s',at(3,0,0)));
 assert.equal(bag.sticks,1);
 assert.equal(dyes.size,1);
 assert.deepEqual(taught,[DANDY_YELLOW_DYE]);
});

test('a picked dandy stays picked while the world remembers it collected',()=>{
 const saved=new Map();
 const shared={getEntity:id=>saved.get(id),setEntity:(id,state)=>saved.set(id,state)};
 const {ground}=makeGround(shared);
 ground.spawn('dandy','d1',at(1,.2,0));
 saved.set('d1',{state:'collected'});
 ground.unload('d1');
 assert.equal(ground.spawn('dandy','d1',at(1,.2,0)),false);
 saved.set('d1',{state:'standing'});
 assert.ok(ground.spawn('dandy','d1',at(1,.2,0)));
});
