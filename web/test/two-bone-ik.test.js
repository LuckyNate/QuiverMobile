import test from 'node:test';
import assert from 'node:assert/strict';
import {solveTwoBone} from '../src/engine/two-bone-ik.js';
const d=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const origin={x:0,y:0,z:0};
test('Jim two-bone solver reaches a planted foot with both bones at fixed lengths',()=>{
 const target={x:.2,y:-.7,z:.2};
 const {joint,end,reachable}=solveTwoBone(origin,target,.46,.46,{x:0,y:0,z:1});
 assert.equal(reachable,true);
 assert.ok(d(end,target)<1e-7);
 assert.ok(Math.abs(d(origin,joint)-.46)<1e-6);
 assert.ok(Math.abs(d(joint,end)-.46)<1e-6);
 assert.ok(joint.z>0);
});
test('out of reach targets are constrained to anatomical bone lengths',()=>{
 const target={x:0,y:-3,z:0};
 const {joint,end,reachable}=solveTwoBone(origin,target,.45,.45,{x:0,y:0,z:1});
 assert.equal(reachable,false);
 assert.ok(d(origin,end)<.901);
 assert.ok(Math.abs(d(origin,joint)-.45)<1e-6);
 assert.ok(Math.abs(d(joint,end)-.45)<1e-6);
});
test('solver remains finite for coincident and parallel bend inputs',()=>{
 for(const target of [origin,{x:0,y:-.6,z:0}]){
  const result=solveTwoBone(origin,target,.4,.4,{x:0,y:-1,z:0});
  for(const part of [result.joint,result.end])
   for(const value of Object.values(part))assert.ok(Number.isFinite(value));
 }
});
test('invalid bone lengths are rejected',()=>{
 assert.throws(()=>solveTwoBone(origin,origin,0,.3,origin),RangeError);
});
