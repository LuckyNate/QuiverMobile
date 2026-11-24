import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Boar,BOAR,BOAR_BEHAVIOUR} from '../../src/engine/creature/boar.js';
import {surfaceFrame} from '../../src/engine/creature/behaviour.js';

const RADIUS=200;
const height={height:()=>10};
const surface=point=>point.clone().normalize().multiplyScalar(RADIUS+10);
const SPAWN=surface(new THREE.Vector3(0,0,1));

function fixture(){
 const boar=new Boar({id:'F06:boar:0:0:0',position:SPAWN.toArray()});
 boar.patrolWait=99;
 const {nose}=surfaceFrame(boar.at);
 boar.heading=nose.clone();
 const events={hits:0,damage:0,retired:null};
 const ctx=player=>({player,height,radius:RADIUS,
  hitPlayer:amount=>{events.hits++;events.damage=amount;},
  retire:creature=>{events.retired=creature.id;}});
 // A player standing `metres` along the boar's nose, in front or behind it.
 const playerAt=(metres,{behind=false}={})=>surface(boar.at.clone()
  .addScaledVector(nose,behind?-metres:metres));
 const moveAlong=(metres)=>boar.at.copy(surface(boar.at.clone().addScaledVector(nose,metres)));
 return {boar,nose,events,ctx,playerAt,moveAlong};
}

test('a boar goes for you at five metres, whichever way it is facing',()=>{
 const f=fixture();
 assert.equal(BOAR.aggro,5);
 assert.equal(BOAR.maxHealth,3);
 assert.equal(BOAR_BEHAVIOUR.spotted(f.boar,f.playerAt(8)),null);              // too far
 const seen=BOAR_BEHAVIOUR.spotted(f.boar,f.playerAt(4.5));
 assert.ok(seen>4&&seen<5);
 assert.ok(BOAR_BEHAVIOUR.spotted(f.boar,f.playerAt(4,{behind:true}))>0);      // no cone, it just charges
});

test('it alerts, closes in and bumps its snout to bite',()=>{
 const f=fixture();
 const player=f.playerAt(3);
 BOAR_BEHAVIOUR.think(f.boar,1/60,f.ctx(player));
 assert.equal(f.boar.state,'alerted');
 BOAR_BEHAVIOUR.think(f.boar,BOAR.alertSeconds,f.ctx(player));
 assert.equal(f.boar.state,'attacking');
 const before=f.boar.at.distanceTo(player);
 let guard=0;
 while(f.events.hits===0&&guard++<400)BOAR_BEHAVIOUR.think(f.boar,1/60,f.ctx(player));
 assert.equal(f.events.hits,1);
 assert.equal(f.events.damage,BOAR.damage);
 assert.equal(BOAR.damage,1);
 assert.ok(f.boar.at.distanceTo(player)<before);   // it walked into you to do it
 // The bite is on a clock, not on contact: nothing lands during the wait.
 const landed=f.events.hits;
 for(let i=0;i<60;i++)BOAR_BEHAVIOUR.think(f.boar,1/60,f.ctx(player));
 assert.equal(f.events.hits,landed);
 for(let i=0;i<Math.ceil(BOAR.swingSeconds*60);i++)BOAR_BEHAVIOUR.think(f.boar,1/60,f.ctx(player));
 assert.equal(f.events.hits,landed+1);
});

test('being hit provokes it and losing the player walks it home',()=>{
 const f=fixture();
 BOAR_BEHAVIOUR.provoked(f.boar);
 assert.equal(f.boar.state,'alerted');
 f.moveAlong(3);
 f.boar.state='attacking';
 const before=f.boar.at.distanceTo(f.boar.home);
 assert.ok(before>2);
 BOAR_BEHAVIOUR.think(f.boar,1/60,f.ctx(f.playerAt(40)));
 assert.equal(f.boar.state,'returning');
 BOAR_BEHAVIOUR.think(f.boar,1,f.ctx(f.playerAt(40,{behind:true})));
 assert.ok(f.boar.at.distanceTo(f.boar.home)<before);
});

test('death lays it over and leaves the carcass in place',()=>{
 const f=fixture();
 f.boar.dead=true;
 BOAR_BEHAVIOUR.enter(f.boar,'dead');
 BOAR_BEHAVIOUR.think(f.boar,BOAR.fallSeconds/2,f.ctx(f.playerAt(1)));
 assert.ok(f.boar.tip>0&&f.boar.tip<1);
 assert.equal(f.events.hits,0);                  // a carcass never bites
 BOAR_BEHAVIOUR.think(f.boar,BOAR.fallSeconds,f.ctx(f.playerAt(1)));
 assert.equal(f.boar.tip,1);
 assert.equal(f.events.retired,null);            // it stays until a knife takes it
});
