import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BOW,carry,planShot,toleranceAt} from '../../src/engine/combat/arrow.js';
import {WEAPONS} from '../../src/engine/combat/combat.js';

const RADIUS=210;
const shooter=new THREE.Vector3(0,0,RADIUS);
const up=shooter.clone().normalize();
// A target `distance` metres away along the surface, which is where an animal
// standing on the ground actually is.
const along=distance=>new THREE.Vector3(distance,0,Math.sqrt(RADIUS*RADIUS-distance*distance));
const hitSpot=distance=>along(distance).addScaledVector(up,BOW.hitHeight);
const holdFor=distance=>distance/BOW.range*BOW.drawSeconds;
const shoot=(distance,hold=holdFor(distance))=>
 planShot({from:shooter.clone(),to:along(distance),up,hold});

test('the draw decides the carry: half a draw is half the range',()=>{
 assert.equal(carry(0),0);
 assert.ok(Math.abs(carry(BOW.drawSeconds/2)-BOW.range/2)<1e-9);
 assert.equal(carry(BOW.drawSeconds*5),BOW.range);
 assert.equal(carry(-1),0);
});

test('releasing at the right moment hits the animal it was aimed at',()=>{
 const plan=shoot(6);
 assert.equal(plan.fired,true);
 assert.equal(plan.hit,true);
 // The arrow runs the tangent line, so it ends a hand's width above the ground
 // point, which is inside the animal either way.
 assert.ok(plan.end.distanceTo(hitSpot(6))<.25,'the arrow arrives in the animal');
});

test('letting go too soon drops the arrow short',()=>{
 const plan=shoot(6,holdFor(6)*.4);
 assert.equal(plan.hit,false);
 assert.ok(plan.distance<6,'it lands before the animal');
 assert.ok(plan.end.distanceTo(shooter)<5.9);
});

test('holding too long sails past the animal',()=>{
 const plan=shoot(6,BOW.drawSeconds);
 assert.equal(plan.hit,false);
 assert.ok(plan.distance>6,'it lands beyond the animal');
 assert.ok(plan.end.distanceTo(shooter)>17,'a full draw reaches the whole range');
});

test('an animal out of range is not shot at at all',()=>{
 const plan=shoot(BOW.range+3);
 assert.equal(plan.fired,false);
 assert.equal(plan.reason,'range');
});

test('the arrow flies an arc rather than a straight line',()=>{
 const plan=shoot(10);
 const start=plan.pointAt(0),middle=plan.pointAt(.5),end=plan.pointAt(1);
 assert.ok(start.distanceTo(plan.start)<1e-9);
 assert.ok(end.distanceTo(plan.end)<1e-9);
 const chord=start.clone().lerp(end,.5).dot(up);
 assert.ok(middle.dot(up)-chord>.5,'the middle of the flight sits above the line');
});

test('the release window widens with distance so far shots stay fair',()=>{
 assert.ok(toleranceAt(BOW.range)>toleranceAt(2));
 assert.ok(toleranceAt(BOW.range)<=3.5);
});

test('the bow has range instead of reach, so a tap never lands a melee hit',()=>{
 assert.equal(WEAPONS.bow.ranged,true);
 assert.equal(WEAPONS.bow.reach,undefined);
 assert.equal(WEAPONS.bow.range,BOW.range);
});
