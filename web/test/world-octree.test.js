import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldOctree,sweptBounds} from '../src/engine/world-octree.js';
const box=(x,y,z,s=1)=>({min:[x,y,z],max:[x+s,y+s,z+s]});
test('static ground and player occupy same tree and query correctly',()=>{
 const tree=new WorldOctree({halfSize:32});
 tree.insert('ground',box(-8,-2,-8,16),{owner:'planet'});
 tree.insert('player',box(0,0,0),{kind:'player'});
 assert.equal(tree.candidates('player').length,1);
 assert.equal(tree.candidates('player')[0].id,'ground');
});
test('dynamic movement reindexes; old location is vacated',()=>{
 const t=new WorldOctree({halfSize:32,maxDepth:6});
 t.insert('cube',box(-10,0,0),{kind:'dynamic'});
 t.update('cube',box(10,0,0));
 assert.equal(t.query(box(-10,0,0)).length,0);
 assert.equal(t.query(box(10,0,0))[0].id,'cube');
 t.remove('cube');assert.equal(t.objects.size,0);
});
test('swept AABB finds crossing contacts even without endpoint overlap',()=>{
 const t=new WorldOctree({halfSize:32});
 t.insert('wall',box(0,0,0),{owner:'wall'});
 t.insert('cube',box(-5,0,0),{kind:'dynamic'});
 assert.deepEqual(t.physicsCandidates('cube',box(5,0,0)).map(x=>x.id),['wall']);
});
test('face-adjacent static boxes merge but distinct owners do not',()=>{
 const t=new WorldOctree({halfSize:32});
 t.insert('left',box(0,0,0),{owner:'wall'});
 t.insert('right',box(1,0,0),{owner:'wall'});
 t.insert('other',box(2,0,0),{owner:'pillar'});
 assert.equal(t.compactStatic('wall'),1);
 assert.equal(t.objects.size,2);
 assert.deepEqual(t.get('left').box.max,[2,1,1]);
});
test('nonrectangular touches and triangle identities remain separate',()=>{
 const t=new WorldOctree({halfSize:32});
 t.insert('a',box(0,0,0),{owner:'solid'});
 t.insert('b',box(1,1,0),{owner:'solid'});
 assert.equal(t.compactStatic('solid'),2);
 t.insertTerrainTriangles('planet',[0,0,0,2,0,0,0,0,2]);
 assert.equal(t.query(box(.2,0,.2)).some(x=>x.shape==='triangle'),true);
 assert.equal(t.get('planet:tri:0').triangle.length,3);
});
test('reject out-of-root and duplicate occupants instead of silently losing them',()=>{
 const t=new WorldOctree({halfSize:2});
 assert.throws(()=>t.insert('a',box(3,0,0)),RangeError);
 t.insert('a',box(0,0,0));
 assert.throws(()=>t.insert('a',box(0,0,0)));
 assert.throws(()=>t.update('a',box(3,0,0)),RangeError);
});
