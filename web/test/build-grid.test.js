import test from 'node:test';
import assert from 'node:assert/strict';
import {BuildGrid,CELL_METERS,POST_HEIGHT,LOG_HEIGHT,COURSES,CROSS_LOGS,SOLID,WINDOW,DOOR} from '../src/engine/build/build-grid.js';

test('a cell is four metres across',()=>{
 assert.equal(CELL_METERS,4);
});

test('a wall is eight half-metre logs up to the post line',()=>{
 assert.equal(LOG_HEIGHT,.5);
 assert.equal(COURSES,7);
 assert.equal((COURSES+1)*LOG_HEIGHT,POST_HEIGHT);
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

function flooredCell(grid,i,j){
 for(const {key} of grid.sidesOf(i,j))grid.layGround(key);
 for(let n=0;n<CROSS_LOGS;n++)grid.addCross(i,j);
 grid.refreshFloor(i,j);
}

test('a window can be cut into a wall',()=>{
 const grid=new BuildGrid();
 const gap=grid.sidesOf(0,0)[0].key;
 assert.ok(grid.cut(gap,1,WINDOW));
 assert.equal(grid.openingsAt(gap)[1],WINDOW);
});

test('a window can be widened into a door',()=>{
 const grid=new BuildGrid();
 const gap=grid.sidesOf(0,0)[0].key;
 grid.cut(gap,1,WINDOW);
 assert.ok(grid.cut(gap,1,DOOR));
 assert.equal(grid.openingsAt(gap)[1],DOOR);
});

test('a door can never be narrowed back to a window',()=>{
 const grid=new BuildGrid();
 const gap=grid.sidesOf(0,0)[0].key;
 grid.cut(gap,1,DOOR);
 assert.equal(grid.cut(gap,1,WINDOW),false);
 assert.equal(grid.openingsAt(gap)[1],DOOR);
});

test('three windows are allowed, a fourth slot is not there',()=>{
 const grid=new BuildGrid();
 const gap=grid.sidesOf(0,0)[0].key;
 for(const slot of [0,1,2])assert.ok(grid.cut(gap,slot,WINDOW));
 assert.equal(grid.cut(gap,3,WINDOW),false);
});

test('a door and two windows are allowed, but not a third door',()=>{
 const grid=new BuildGrid();
 const gap=grid.sidesOf(0,0)[0].key;
 assert.ok(grid.cut(gap,1,DOOR));
 assert.ok(grid.cut(gap,0,WINDOW));
 assert.ok(grid.cut(gap,2,WINDOW));
 assert.ok(grid.cut(gap,0,DOOR));
 assert.equal(grid.cut(gap,2,DOOR),false);
});

test('a double door takes one more window and no more',()=>{
 const grid=new BuildGrid();
 const gap=grid.sidesOf(0,0)[0].key;
 assert.ok(grid.cut(gap,0,DOOR));
 assert.ok(grid.cut(gap,1,DOOR));
 assert.equal(grid.doubleDoor(gap),0);
 assert.ok(grid.cut(gap,2,WINDOW));
 assert.equal(grid.cut(gap,2,DOOR),false);
});

test('only a wall with rooms on both sides can be blown open',()=>{
 const grid=new BuildGrid();
 const gap=grid.sidesOf(0,0)[2].key;
 flooredCell(grid,0,0);
 assert.equal(grid.isInterior(gap),false);
 assert.equal(grid.blowOpen(gap),false);
 flooredCell(grid,0,1);
 assert.ok(grid.isInterior(gap));
 assert.ok(grid.blowOpen(gap));
 assert.ok(grid.isBlown(gap));
 assert.equal(grid.blowOpen(gap),false);
});

test('a stacked course comes back one log at a time',()=>{
 const grid=new BuildGrid();
 const gap=grid.sidesOf(0,0)[0].key;
 const [[x0,y0],[x1,y1]]=BuildGrid.endsOf(gap);
 grid.restorePost(x0,y0);grid.restorePost(x1,y1);
 grid.addCourse(gap);grid.addCourse(gap);
 assert.ok(grid.takeCourse(gap));
 assert.equal(grid.coursesAt(gap),1);
 assert.ok(grid.takeCourse(gap));
 assert.equal(grid.coursesAt(gap),0);
 assert.equal(grid.takeCourse(gap),false);
});

test('taking the material back opens a finished floor again',()=>{
 const grid=new BuildGrid();
 flooredCell(grid,0,0);
 assert.ok(grid.isFloored(0,0));
 assert.ok(grid.takeCross(0,0));
 assert.ok(grid.unfloor(0,0));
 assert.equal(grid.isFloored(0,0),false);
});

test('a floor that still has its material stays a floor',()=>{
 const grid=new BuildGrid();
 flooredCell(grid,0,0);
 assert.equal(grid.unfloor(0,0),false);
 assert.ok(grid.isFloored(0,0));
});

test('a post and a ground log can be lifted back out',()=>{
 const grid=new BuildGrid();
 const gap=grid.sidesOf(0,0)[0].key;
 grid.restorePost(0,0);
 grid.layGround(gap);
 assert.ok(grid.removePost(0,0));
 assert.equal(grid.hasPost(0,0),false);
 assert.ok(grid.removeGround(gap));
 assert.equal(grid.groundLaid(gap),false);
});

test('a gap that has been cut has no whole logs left to take',()=>{
 const grid=new BuildGrid();
 const gap=grid.sidesOf(0,0)[0].key;
 grid.cut(gap,1,WINDOW);
 assert.notEqual(grid.openingsAt(gap)[1],SOLID);
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
