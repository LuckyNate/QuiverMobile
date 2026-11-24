import test from 'node:test';
import assert from 'node:assert/strict';
import {SpawnRegistry} from '../../src/engine/population/spawn-registry.js';
import {SPAWN_CATEGORIES} from '../../src/engine/population/spawn-kind.js';

const adapter=()=>({spawn:()=>true,unload:()=>true});

test('resources and creatures share one registry',()=>{
 const registry=new SpawnRegistry();
 registry.register({type:'tree',category:'resource',adapter:adapter()});
 registry.register({type:'boar',category:'creature',adapter:adapter()});
 assert.equal(registry.size,2);
 assert.deepEqual(registry.ofCategory('creature').map(kind=>kind.type),['boar']);
 assert.deepEqual(registry.ofCategory('resource').map(kind=>kind.type),['tree']);
 assert.ok(registry.spawn('boar','F06:boar:0:0:0',null,{}));
});

test('a kind spawns only inside its habitat band',()=>{
 const registry=new SpawnRegistry();
 const kind=registry.register({type:'boar',category:'creature',adapter:adapter(),
  minElevation:5,maxElevation:20});
 assert.equal(kind.habitat(2),false);
 assert.equal(kind.habitat(9),true);
 assert.equal(kind.habitat(21),false);
});

test('a type needs an adapter and registers once',()=>{
 assert.deepEqual(SPAWN_CATEGORIES,['resource','creature']);
 const registry=new SpawnRegistry();
 assert.throws(()=>registry.register({type:'ghost'}),/spawn\/unload/);
 assert.throws(()=>registry.register({type:'tree',category:'plant',adapter:adapter()}),/category/);
 registry.register({type:'tree',adapter:adapter()});
 assert.throws(()=>registry.register({type:'tree',adapter:adapter()}),/Duplicate/);
});
