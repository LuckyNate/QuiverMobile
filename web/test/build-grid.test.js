import test from 'node:test';
import assert from 'node:assert/strict';
import {BuildGrid,CELL_METERS,FLOOR_LOGS} from '../src/engine/build/build-grid.js';

test('a cell is four metres across',()=>{
 assert.equal(CELL_METERS,4);
});

test('a fresh cell starts on its ground course',()=>{
 const grid=new BuildGrid();
 const plan=grid.plan(0,0);
 assert.equal(plan.level,0);
 assert.equal(plan.closing,false);
 assert.equal(plan.floor,false);
 assert.equal(plan.logs,1);
});

test('the fourth wall closes the ground course and lays four floor logs',()=>{
 const grid=new BuildGrid();
 for(let n=0;n<3;n++)grid.build(0,0);
 const closing=grid.plan(0,0);
 assert.equal(closing.closing,true);
 assert.equal(closing.floor,true);
 assert.equal(closing.logs,1+FLOOR_LOGS);
 grid.build(0,0);
 assert.ok(grid.isFloored(0,0));
 assert.ok(grid.enclosed(0,0,0));
});

test('a neighbouring cell shares the wall that already stands',()=>{
 const grid=new BuildGrid();
 for(let n=0;n<4;n++)grid.build(0,0);
 const missing=grid.edgesOf(1,0,0).filter(key=>!grid.edges.has(key));
 assert.equal(missing.length,3);
});

test('after the ground course closes, the next log starts the course above',()=>{
 const grid=new BuildGrid();
 for(let n=0;n<4;n++)grid.build(0,0);
 assert.equal(grid.plan(0,0).level,1);
});

test('floor is laid once per cell, not once per course',()=>{
 const grid=new BuildGrid();
 for(let n=0;n<4;n++)grid.build(0,0);
 assert.equal(grid.build(0,0).floor,false);
 assert.equal(grid.build(0,0).floor,false);
});
