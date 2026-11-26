import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Springs} from '../../src/engine/flora/springs.js';

const RADIUS=243.5;
const at=(x,y,z)=>new THREE.Vector3(x,y,z).normalize().multiplyScalar(RADIUS);
const surface=at(0,1,0);
function makeSprings(shared=null){
 const root=new THREE.Group();
 const player={position:surface.clone()};
 return {root,springs:new Springs({root,shared,player,playerId:'local-owner'})};
}

test('a spring pools on the ground, just above the surface',()=>{
 const {root,springs}=makeSprings();
 const pool=springs.spawn('F06:spring:0:0:0',surface);
 assert.ok(pool);
 assert.equal(pool.state,'standing');
 assert.ok(pool.group.position.length()>surface.length(),'the water floats just clear of the ground');
 assert.equal(root.children.length,1);
 // The pool lies flat on the ground under it, whatever direction that is.
 const facing=new THREE.Vector3(0,1,0).applyQuaternion(pool.group.quaternion);
 assert.ok(facing.dot(pool.up)>.999);
});

test('a spring is one pool per slot and leaves when its cell goes away',()=>{
 const {root,springs}=makeSprings();
 assert.ok(springs.spawn('a',surface));
 assert.equal(springs.spawn('a',surface),false);
 assert.equal(springs.pools.size,1);
 assert.equal(springs.unload('a'),true);
 assert.equal(springs.pools.size,0);
 assert.equal(root.children.length,0);
 assert.equal(springs.unload('a'),false);
});

test('a spring the save already marked used is not rebuilt',()=>{
 const saved=new Map([['a',{state:'collected'}]]);
 const {springs}=makeSprings({getEntity:id=>saved.get(id)});
 assert.equal(springs.spawn('a',surface),false);
 saved.set('a',{state:'standing'});
 assert.ok(springs.spawn('a',surface));
});

test('a pool in scenery range stays visible and keeps its swell',()=>{
 const {springs}=makeSprings();
 const pool=springs.spawn('a',surface);
 springs.update(.016);
 assert.equal(pool.group.visible,true);
 const rest=pool.water.position.y;
 springs.update(.7);
 assert.notEqual(pool.water.position.y,rest);
});
