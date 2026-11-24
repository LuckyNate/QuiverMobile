import test from 'node:test';
import assert from 'node:assert/strict';
import {Combat,WEAPONS} from '../../src/engine/combat/combat.js';

const target=(health=3)=>({health,dead:false});

test('a level 1 weapon takes one hit point and waits out its cooldown',()=>{
 const combat=new Combat();
 const boar=target();
 assert.equal(combat.damage('club'),1);
 assert.deepEqual(combat.strike({weapon:'club',target:boar,now:1000}),{swing:true,damage:1,killed:false});
 assert.equal(boar.health,2);
 assert.equal(combat.strike({weapon:'club',target:boar,now:1300}).swing,false);
 assert.equal(boar.health,2);
 assert.equal(combat.strike({weapon:'club',target:boar,now:1600}).swing,true);
});

test('three hits put a boar down and the killing blow is reported once',()=>{
 const combat=new Combat();
 const boar=target(3);
 const kills=[];
 for(const now of [0,1000,2000])kills.push(combat.strike({weapon:'club',target:boar,now}).killed);
 assert.deepEqual(kills,[false,false,true]);
 assert.equal(boar.health,0);
 assert.equal(boar.dead,true);
 const after=combat.strike({weapon:'club',target:boar,now:5000});
 assert.deepEqual([after.damage,after.killed],[0,false]);
});

test('an unknown weapon never swings and a bow outranges a club',()=>{
 assert.equal(new Combat().strike({weapon:'axe',target:target(),now:0}).swing,false);
 // The bow outranges a club by having a range at all: it has no reach, so it
 // cannot damage anything on the spot.
 assert.ok(WEAPONS.club.reach<WEAPONS.bow.range);
 assert.equal(WEAPONS.bow.reach,undefined);
 assert.ok(WEAPONS.knife.reach<WEAPONS.club.reach);
 assert.equal(new Combat().readyIn('player','axe',0),Infinity);
});
