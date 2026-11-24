import test from 'node:test';
import assert from 'node:assert/strict';
import {BuildGrid,CELL_METERS,FLOOR_LOGS} from '../src/engine/build/build-grid.js';

test('a cell is four metres across',()=>{
 assert.equal(CELL_METERS,4);
});

test('an empty cell asks for its first post',()=>{
 const grid=new BuildGrid();
 const plan=grid.plan(0,0);
 assert.equal(plan.kind,'post');
 assert.equal(plan.logs,1);
 assert.equal(grid.framed(0,0),false);
});

test('four posts frame the rectangle and the floor comes next',()=>{
 const grid=new BuildGrid();
 for(const [x,y] of grid.cornersOf(0,0))assert.ok(grid.raisePost(x,y));
 assert.ok(grid.framed(0,0));
 const plan=grid.plan(0,0);
 assert.equal(plan.kind,'floor');
 assert.equal(plan.logs,FLOOR_LOGS);
 assert.ok(grid.layFloor(0,0));
 assert.ok(grid.isFloored(0,0));
});

test('a floor needs the frame, not the walls',()=>{
 const grid=new BuildGrid();
 for(const [x,y] of grid.cornersOf(0,0))grid.raisePost(x,y);
 assert.equal(grid.walls.size,0);
 assert.ok(grid.layFloor(0,0));
});

test('the floor is laid once',()=>{
 const grid=new BuildGrid();
 for(const [x,y] of grid.cornersOf(0,0))grid.raisePost(x,y);
 assert.ok(grid.layFloor(0,0));
 assert.equal(grid.layFloor(0,0),false);
});

test('a gap belongs to both cells either side of it',()=>{
 const grid=new BuildGrid();
 const east=grid.sidesOf(0,0).find(({side})=>side==='east').key;
 const west=grid.sidesOf(1,0).find(({side})=>side==='west').key;
 assert.equal(east,west);
 assert.ok(grid.raiseWall(east));
 assert.ok(grid.wallBuilt(west));
});

test('a gap can be filled and opened again, and the room keeps its floor',()=>{
 const grid=new BuildGrid();
 for(const [x,y] of grid.cornersOf(0,0))grid.raisePost(x,y);
 grid.layFloor(0,0);
 const gap=grid.sidesOf(0,0)[0].key;
 assert.ok(grid.raiseWall(gap));
 assert.ok(grid.openWall(gap));
 assert.equal(grid.wallBuilt(gap),false);
 assert.ok(grid.isFloored(0,0));
});

test('a framed and floored cell is finished: one storey, nothing above',()=>{
 const grid=new BuildGrid();
 for(const [x,y] of grid.cornersOf(0,0))grid.raisePost(x,y);
 grid.layFloor(0,0);
 assert.equal(grid.plan(0,0),null);
});

test('a shared post is only raised once',()=>{
 const grid=new BuildGrid();
 assert.ok(grid.raisePost(1,1));
 assert.equal(grid.raisePost(1,1),false);
});
