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

test('a boar notices what it can hear and what it can see',()=>{
 const f=fixture();
 assert.equal(BOAR_BEHAVIOUR.spotted(f.boar,f.playerAt(30)),null);            // out of range
 const inCone=BOAR_BEHAVIOUR.spotted(f.boar,f.playerAt(13));
 assert.ok(inCone>12&&inCone<14);
 assert.equal(BOAR_BEHAVIOUR.spotted(f.boar,f.playerAt(13,{behind:true})),null); // behind, too far to hear
 assert.ok(BOAR_BEHAVIOUR.spotted(f.boar,f.playerAt(8,{behind:true}))>0);        // close enough to hear
});

test('it alerts, closes in and swings on a clock',()=>{
 const f=fixture();
 const player=f.playerAt(1.2);
 BOAR_BEHAVIOUR.think(f.boar,1/60,f.ctx(player));
 assert.equal(f.boar.state,'alerted');
 BOAR_BEHAVIOUR.think(f.boar,BOAR.alertSeconds,f.ctx(player));
 assert.equal(f.boar.state,'attacking');
 BOAR_BEHAVIOUR.think(f.boar,1/60,f.ctx(player));
 assert.equal(f.events.hits,1);
 assert.equal(f.events.damage,BOAR.damage);
 BOAR_BEHAVIOUR.think(f.boar,1/60,f.ctx(player));
 assert.equal(f.events.hits,1);                       // still cooling down
 BOAR_BEHAVIOUR.think(f.boar,BOAR.swingSeconds,f.ctx(player));
 assert.equal(f.events.hits,2);
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

test('death fades the boar and then retires it',()=>{
 const f=fixture();
 BOAR_BEHAVIOUR.enter(f.boar,'dying');
 BOAR_BEHAVIOUR.think(f.boar,BOAR.dyingSeconds/2,f.ctx(f.playerAt(1)));
 assert.ok(f.boar.fade>0&&f.boar.fade<1);
 assert.equal(f.events.retired,null);
 BOAR_BEHAVIOUR.think(f.boar,BOAR.dyingSeconds,f.ctx(f.playerAt(1)));
 assert.equal(f.events.retired,f.boar.id);
});
