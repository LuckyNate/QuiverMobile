import test from 'node:test';
import assert from 'node:assert/strict';
import {BuildGrid,CELL_METERS,COURSES,CROSS_LOGS} from '../src/engine/build/build-grid.js';

test('a cell is four metres across',()=>{
 assert.equal(CELL_METERS,4);
});

test('a floor is the ground square plus the cross in the middle',()=>{
 const grid=new BuildGrid();
 for(const {key} of grid.sidesOf(0,0))assert.ok(grid.layGround(key));
 assert.equal(grid.readyToFloor(0,0),false);
 for(let n=0;n<CROSS_LOGS;n++)assert.ok(grid.addCross(0,0));
 assert.equal(grid.readyToFloor(0,0),true);
 assert.ok(grid.refreshFloor(0,0));
 assert.ok(grid.isFloored(0,0));
});

test('a missing ground log leaves no floor',()=>{
 const grid=new BuildGrid();
 const sides=grid.sidesOf(0,0);
 for(const {key} of sides.slice(1))grid.layGround(key);
 for(let n=0;n<CROSS_LOGS;n++)grid.addCross(0,0);
 assert.equal(grid.readyToFloor(0,0),false);
 assert.equal(grid.refreshFloor(0,0),false);
});

test('a missing cross log leaves no floor',()=>{
 const grid=new BuildGrid();
 for(const {key} of grid.sidesOf(0,0))grid.layGround(key);
 grid.addCross(0,0);
 assert.equal(grid.readyToFloor(0,0),false);
});

test('the floor is finished once, not again',()=>{
 const grid=new BuildGrid();
 for(const {key} of grid.sidesOf(0,0))grid.layGround(key);
 for(let n=0;n<CROSS_LOGS;n++)grid.addCross(0,0);
 assert.ok(grid.refreshFloor(0,0));
 assert.equal(grid.refreshFloor(0,0),false);
});

test('a wall course needs the posts at both ends',()=>{
 const grid=new BuildGrid();
 const gap=grid.sidesOf(0,0)[0].key;
 assert.equal(grid.addCourse(gap),false);
 const [[x0,y0],[x1,y1]]=BuildGrid.endsOf(gap);
 grid.restorePost(x0,y0);grid.restorePost(x1,y1);
 assert.ok(grid.addCourse(gap));
 assert.equal(grid.coursesAt(gap),1);
});

test('walls stack to the post height and stop there',()=>{
 const grid=new BuildGrid();
 const gap=grid.sidesOf(0,0)[0].key;
 const [[x0,y0],[x1,y1]]=BuildGrid.endsOf(gap);
 grid.restorePost(x0,y0);grid.restorePost(x1,y1);
 for(let n=0;n<COURSES;n++)assert.ok(grid.addCourse(gap));
 assert.equal(grid.coursesAt(gap),COURSES);
 assert.equal(grid.addCourse(gap),false);
});

test('a ground log belongs to both cells either side of it',()=>{
 const grid=new BuildGrid();
 const east=grid.sidesOf(0,0).find(({side})=>side==='east').key;
 const west=grid.sidesOf(1,0).find(({side})=>side==='west').key;
 assert.equal(east,west);
 grid.layGround(east);
 assert.ok(grid.groundLaid(west));
});

test('the middle of a cell asks for ground, then cross, then posts',()=>{
 const grid=new BuildGrid();
 assert.equal(grid.plan(0,0).kind,'ground');
 for(const {key} of grid.sidesOf(0,0))grid.layGround(key);
 assert.equal(grid.plan(0,0).kind,'cross');
 for(let n=0;n<CROSS_LOGS;n++)grid.addCross(0,0);
 assert.equal(grid.plan(0,0).kind,'post');
 for(const [x,y] of grid.cornersOf(0,0))grid.restorePost(x,y);
 assert.equal(grid.plan(0,0),null);
});
