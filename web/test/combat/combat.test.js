import test from 'node:test';
import assert from 'node:assert/strict';
import {Combat,WEAPONS} from '../../src/engine/combat/combat.js';

const target=()=>({health:24,dead:false});

test('a club swing costs health and waits out its cooldown',()=>{
 const combat=new Combat();
 const boar=target();
 assert.deepEqual(combat.strike({weapon:'club',target:boar,now:1000}),{swing:true,damage:8,killed:false});
 assert.equal(boar.health,16);
 assert.equal(combat.strike({weapon:'club',target:boar,now:1300}).swing,false);
 assert.equal(boar.health,16);
 assert.equal(combat.strike({weapon:'club',target:boar,now:1600}).swing,true);
});

test('the killing blow is reported once, at zero health',()=>{
 const combat=new Combat();
 const boar=target();
 let killed=false;
 for(const now of [0,1000,2000])killed=combat.strike({weapon:'club',target:boar,now}).killed||killed;
 assert.equal(boar.health,0);
 assert.equal(boar.dead,true);
 assert.equal(killed,true);
 const after=combat.strike({weapon:'club',target:boar,now:5000});
 assert.equal(after.damage,0);
 assert.equal(after.killed,false);
});

test('an unknown weapon never swings and a bow outranges a club',()=>{
 assert.equal(new Combat().strike({weapon:'axe',target:target(),now:0}).swing,false);
 assert.ok(WEAPONS.club.reach<WEAPONS.bow.reach);
 assert.equal(new Combat().readyIn('player','axe',0),Infinity);
});
