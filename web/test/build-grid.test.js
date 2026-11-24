import test from 'node:test';
import assert from 'node:assert/strict';
import {BuildGrid,CELL_METERS,FLOOR_LOGS} from '../src/engine/build/build-grid.js';

test('a cell is four metres across',()=>{
 assert.equal(CELL_METERS,4);
});

test('a fresh cell starts on its first wall',()=>{
 const grid=new BuildGrid();
 const plan=grid.plan(0,0);
 assert.equal(plan.closing,false);
 assert.equal(plan.floor,false);
 assert.equal(plan.logs,1);
});

test('the fourth wall closes the room and lays four floor logs',()=>{
 const grid=new BuildGrid();
 for(let n=0;n<3;n++)grid.build(0,0);
 const closing=grid.plan(0,0);
 assert.equal(closing.closing,true);
 assert.equal(closing.floor,true);
 assert.equal(closing.logs,1+FLOOR_LOGS);
 grid.build(0,0);
 assert.ok(grid.isFloored(0,0));
 assert.ok(grid.enclosed(0,0));
});

test('a neighbouring cell shares the wall that already stands',()=>{
 const grid=new BuildGrid();
 for(let n=0;n<4;n++)grid.build(0,0);
 const missing=grid.sidesOf(1,0).filter(({key})=>grid.state(key)==='missing');
 assert.equal(missing.length,3);
});

test('building is one storey: a finished cell offers nothing more',()=>{
 const grid=new BuildGrid();
 for(let n=0;n<4;n++)grid.build(0,0);
 assert.equal(grid.plan(0,0),null);
});

test('a wall toggles between solid and an open doorway',()=>{
 const grid=new BuildGrid();
 grid.build(0,0);
 const key=grid.sidesOf(0,0)[0].key;
 assert.equal(grid.state(key),'built');
 assert.equal(grid.toggle(key),'open');
 assert.equal(grid.state(key),'open');
 assert.equal(grid.toggle(key),'built');
 assert.equal(grid.state(key),'built');
});

test('an open doorway still counts as a room',()=>{
 const grid=new BuildGrid();
 for(let n=0;n<4;n++)grid.build(0,0);
 const key=grid.sidesOf(0,0)[1].key;
 grid.toggle(key);
 assert.equal(grid.state(key),'open');
 assert.ok(grid.enclosed(0,0));
});
