import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyTerrainVolumes} from '../src/engine/terrain-occupancy.js';
const vertices=[[2,0,0],[-2,0,0],[0,2,0],[0,-2,0],[0,0,2],[0,0,-2]];
const triangles=[[0,2,4],[2,1,4],[1,3,4],[3,0,4],[2,0,5],[1,2,5],[3,1,5],[0,3,5]];
const mesh=new Float32Array(triangles.flatMap(tri=>tri.flatMap(i=>vertices[i])));
const contains=(box,p)=>p.every((v,i)=>v>=box.min[i]&&v<=box.max[i]);
test('octree solidifies beneath triangulated surface without filling open air',()=>{
 const blocks=classifyTerrainVolumes(mesh,[0,0,0],{halfSize:4,maxDepth:5});
 assert.ok(blocks.length>0);
 assert.ok(blocks.some(b=>contains(b,[0,0,0])));
 assert.ok(!blocks.some(b=>contains(b,[3,0,0])));
});
test('boundary resolution increases as octree subdivides',()=>{
 const coarse=classifyTerrainVolumes(mesh,[0,0,0],{halfSize:4,maxDepth:3});
 const fine=classifyTerrainVolumes(mesh,[0,0,0],{halfSize:4,maxDepth:5});
 assert.ok(fine.length>coarse.length);
});
