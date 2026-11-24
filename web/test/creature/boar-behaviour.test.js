import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Boar,BOAR,BOAR_BEHAVIOUR} from '../../src/engine/creature/boar.js';
import {surfaceFrame} from '../../src/engine/creature/behaviour.js';
import {PLAYER_SPEED} from '../../src/engine/world/world-config.js';

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

test('it alerts, closes to its ring and lunges to bite',()=>{
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
 assert.ok(f.boar.at.distanceTo(player)<before);   // it closed from three metres to bite
 assert.ok(f.boar.at.distanceTo(player)>=BOAR.reach*.5,'the lunge never buries it in you');
 // The bite is on a clock, not on contact: nothing lands during the wait.
 const landed=f.events.hits;
 for(let i=0;i<60;i++)BOAR_BEHAVIOUR.think(f.boar,1/60,f.ctx(player));
 assert.equal(f.events.hits,landed);
 for(let i=0;i<Math.ceil(BOAR.swingSeconds*60);i++)BOAR_BEHAVIOUR.think(f.boar,1/60,f.ctx(player));
 assert.equal(f.events.hits,landed+1);
});

test('it chases at the player\'s own speed and stops on its ring',()=>{
 const f=fixture();
 assert.equal(BOAR.chase,PLAYER_SPEED);
 const player=f.playerAt(5);
 BOAR_BEHAVIOUR.provoked(f.boar);
 BOAR_BEHAVIOUR.think(f.boar,BOAR.alertSeconds,f.ctx(player));
 f.boar.swingClock=BOAR.swingSeconds;   // hold the bite, so the chase is what is measured
 let last=f.boar.at.distanceTo(player);
 for(let i=0;i<40;i++){
  BOAR_BEHAVIOUR.think(f.boar,1/60,f.ctx(player));
  const gap=f.boar.at.distanceTo(player);
  assert.ok(gap<=last+1e-9,'it never backs off or circles'); // no trailing, no circling
  last=gap;
 }
 assert.ok(Math.abs(last-BOAR.stop)<.05,'it stops on the ring, not in your feet');
 // Turn on it: the next step heads at where you are now, not where you were.
 const turned=f.playerAt(5,{behind:true});
 const before=f.boar.at.distanceTo(turned);
 BOAR_BEHAVIOUR.think(f.boar,1/60,f.ctx(turned));
 assert.ok(f.boar.at.distanceTo(turned)<before,'it cuts the corner immediately');
});

test('one long frame cannot carry it past its ring',()=>{
 const f=fixture();
 f.boar.state='attacking';
 const player=f.playerAt(6);
 BOAR_BEHAVIOUR.think(f.boar,2,f.ctx(player));   // asks for 12 m of travel
 const gap=f.boar.at.distanceTo(player);
 assert.ok(Math.abs(gap-BOAR.stop)<.01,'it stops on the ring');
});

test('it holds the ring instead of orbiting your feet',()=>{
 const f=fixture();
 const player=f.playerAt(BOAR.stop);
 f.boar.state='attacking';
 f.boar.swingClock=BOAR.swingSeconds;
 const parked=f.boar.at.clone();
 for(let i=0;i<10;i++)BOAR_BEHAVIOUR.think(f.boar,1/60,f.ctx(player));
 assert.ok(f.boar.at.distanceTo(parked)<1e-9,'it stands still on the ring');   // no orbiting
 assert.ok(f.boar.at.distanceTo(player)>=BOAR.reach,'and stays out of reach while it waits');
});

test('the bite is a lunge across the ring, then it backs off again',()=>{
 const f=fixture();
 const player=f.playerAt(BOAR.stop);
 f.boar.state='attacking';
 f.boar.swingClock=0;
 BOAR_BEHAVIOUR.think(f.boar,1/60,f.ctx(player));
 assert.equal(f.boar.state,'lunge');
 assert.equal(f.events.hits,0,'deciding to lunge is not a bite');
 let guard=0;
 while(f.events.hits===0&&guard++<30)BOAR_BEHAVIOUR.think(f.boar,1/60,f.ctx(player));
 assert.equal(f.events.hits,1,'the burst lands exactly one bite');
 assert.ok(f.boar.at.distanceTo(player)<BOAR.reach,'it had to come in to reach you');
 while(f.boar.state==='lunge'&&guard++<90)BOAR_BEHAVIOUR.think(f.boar,1/60,f.ctx(player));
 const recoiled=f.boar.at.distanceTo(player);
 for(let i=0;i<20;i++)BOAR_BEHAVIOUR.think(f.boar,1/60,f.ctx(player));
 assert.ok(f.boar.at.distanceTo(player)>recoiled,'it gives ground out of the bite');
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
