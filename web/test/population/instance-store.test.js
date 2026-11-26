import test from 'node:test';
import assert from 'node:assert/strict';
import {InstanceStore} from '../../src/engine/population/instance-store.js';

// The point of the store: a resource, a creature and an enemy are held by exactly
// the same rule, so nothing downstream has to ask what kind a tap landed on.
test('a resource, a creature and an enemy are held identically',()=>{
 const live=new InstanceStore();
 const tree={id:'F06:tree:1',state:'standing'};
 const boar={id:'F06:boar:2',dead:false};
 const enemy={id:'F06:enemy:3'};
 live.put('tree','F06:tree:1',tree);
 live.put('boar','F06:boar:2',boar);
 live.put('enemy','F06:enemy:3',enemy);
 for(const [type,id,instance] of [['tree','F06:tree:1',tree],['boar','F06:boar:2',boar],['enemy','F06:enemy:3',enemy]]){
  assert.equal(live.get(id),instance);
  assert.equal(live.of(type,id),instance);
  assert.equal(live.typeOf(id),type);
  assert.equal(live.has(id),true);
 }
 assert.equal(live.size,3);
 assert.equal(live.count('tree'),1);
});

test('an id reads as its own kind only',()=>{
 const live=new InstanceStore();
 live.put('tree','a',{id:'a'});
 assert.equal(live.of('boar','a'),null);
 assert.equal(live.of('tree','missing'),null);
 assert.equal(live.get('missing'),null);
 assert.equal(live.typeOf('missing'),null);
});

// A slot can come back, but never as two live instances at once.
test('a live id may not be put twice, and dropping frees the slot',()=>{
 const live=new InstanceStore();
 live.put('grass','a',{id:'a'});
 assert.throws(()=>live.put('grass','a',{id:'a'}),/already live as grass/);
 assert.equal(live.drop('a'),true);
 assert.equal(live.has('a'),false);
 assert.equal(live.drop('a'),false);
 live.put('grass','a',{id:'a'});
 assert.equal(live.count('grass'),1);
 assert.deepEqual(live.ids('grass'),['a']);
});

test('the store refuses entries that would be unfindable',()=>{
 const live=new InstanceStore();
 assert.throws(()=>live.put('','a',{}),/needs a kind/);
 assert.throws(()=>live.put('tree','',{}),/needs an id/);
 assert.throws(()=>live.put('tree','a',null),/has nothing to hold/);
});

test('a kind hands out its own live table for iteration',()=>{
 const live=new InstanceStore();
 live.put('tree','a',{id:'a'});
 live.put('tree','b',{id:'b'});
 assert.deepEqual([...live.live('tree').keys()],['a','b']);
 assert.deepEqual([...live.live('enemy').keys()],[]);
});
