import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {PlayerSystem} from '../../src/player/player.js';

const RADIUS=210;
// A point on the planet's surface, `along` metres east of the rig's start.
// Walking is tangential, so goals must be tangential too.
const surface=along=>new THREE.Vector3(along,0,Math.sqrt(RADIUS*RADIUS-along*along));

// The walk-to logic is pure: it reads the avatar position and returns a travel
// direction, so it can be driven here without a scene, camera or physics body.
function rig(){
 const player=Object.create(PlayerSystem.prototype);
 player.position=surface(0);
 player.controls={axes:()=>({x:0,y:0})};
 player.frameUp=null;player.forward=null;
 player.heading=0;player.cameraHeading=0;player.lastTurn=0;
 player.isMoving=false;player.commandedSpeed=0;
 player.walkDestination=null;
 player.walkBest=Infinity;player.walkStall=0;player.walkTime=0;
 player.showAnimation=()=>{};
 return player;
}

const step=(player,dt=1/60)=>PlayerSystem.prototype.movement.call(player,dt);

test('a walk that cannot get closer gives up instead of walking forever',()=>{
 const player=rig();
 // Two metres away and never any nearer: exactly what a sheer bank looks like,
 // because physics refuses the climb and the avatar stays put.
 player.setDestination(surface(2));
 let frames=0;
 while(player.walkDestination&&frames<600){step(player);frames++;}
 assert.equal(player.walkDestination,null,'the goal was abandoned');
 // 1.2 s at 60 fps, plus the frame that trips it.
 assert.ok(frames>=70&&frames<=80,`gave up after ${frames} frames, expected about 73`);
});

test('the avatar stops showing movement once the walk is abandoned',()=>{
 const player=rig();
 player.setDestination(surface(2));
 for(let i=0;i<100;i++)step(player);
 const move=step(player);
 assert.equal(move.length(),0,'no travel direction is left');
 assert.equal(player.isMoving,false,'the walking animation is released');
});

test('a walk that closes the gap still arrives and stops',()=>{
 const player=rig();
 const goal=surface(10);
 player.setDestination(goal);
 for(let i=0;i<200&&player.walkDestination;i++){
  const move=step(player);
  // Stand in for physics: travel along the returned direction at 6 m/s and stay
  // on the surface.
  player.position.addScaledVector(move,6/60).normalize().multiplyScalar(RADIUS);
 }
 assert.equal(player.walkDestination,null,'the goal cleared on arrival');
 assert.ok(player.position.distanceTo(goal)<.7,'stopped at the spot');
 assert.equal(player.isMoving,false);
});

test('a new tap restarts the walk instead of inheriting the old stall',()=>{
 const player=rig();
 player.setDestination(surface(2));
 for(let i=0;i<60;i++)step(player);
 assert.ok(player.walkStall>0,'the first walk had stalled');
 player.setDestination(surface(4));
 assert.equal(player.walkStall,0);
 assert.equal(player.walkTime,0);
 assert.equal(player.walkBest,Infinity);
 assert.ok(player.walkDestination,'the new goal is live');
});
