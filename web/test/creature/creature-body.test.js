import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {PhysicsWorld} from '../../src/engine/physics/physics-world.js';
import {BOAR} from '../../src/engine/creature/boar.js';

const RADIUS=200;
const surface=point=>point.clone().normalize().multiplyScalar(RADIUS+10);
// A metre along the ground from a point already on the surface.
const alongSurface=(point,direction,metres)=>surface(point.clone().addScaledVector(direction,metres));

test('a creature body follows where the behaviour puts the creature',async()=>{
 const world=await new PhysicsWorld().init();
 const at=surface(new THREE.Vector3(0,0,1));
 const creature={id:'F06:boar:0:0:0',at,volume:BOAR.volume};
 world.addCreatureBody(creature);
 const body=()=>world.creatureBodies.get(creature.id).body.getPosition();
 // It is seated on the creature, lifted to the torso, with no lag.
 const target=at.clone().addScaledVector(at.clone().normalize(),BOAR.volume.lift);
 assert.ok(Math.hypot(body().x-target.x,body().y-target.y,body().z-target.z)<1e-6,'seated on spawn');
 // Walk the creature one frame's worth — 6 m/s is a tenth of a metre — and let
 // physics carry the body with it. A teleport is not a walk: that is clamped.
 creature.at=alongSurface(at,new THREE.Vector3(1,0,0),.1);
 world.syncCreatureBodies([creature],1/60);
 world.step(1/60);
 const moved=creature.at.clone().addScaledVector(creature.at.clone().normalize(),BOAR.volume.lift);
 assert.ok(Math.hypot(body().x-moved.x,body().y-moved.y,body().z-moved.z)<.01,'the body keeps up');
 world.removeCreatureBody(creature.id);
 assert.equal(world.creatureBodies.size,0);
});

test('a kinematic creature body blocks the player capsule',async()=>{
 const world=await new PhysicsWorld().init();
 world.world.setGravity({x:0,y:0,z:0});
 const capsule=world.world.createBody({type:'dynamic',position:{x:0,y:0,z:0},
  motionLocks:{angularX:true,angularY:true,angularZ:true},linearDamping:.5});
 capsule.createCapsule({height:1.1,radius:.35,density:1,friction:.8});
 capsule.setLinearVelocity({x:6,y:0,z:0});
 // A boar standing 1.5 m ahead on the capsule's line of travel.
 world.addCreatureBody({id:'blocker',at:new THREE.Vector3(1.5,0,0),
  volume:Object.freeze({shape:'sphere',radius:.6,lift:0})});
 for(let i=0;i<60;i++)world.step(1/60);
 assert.ok(capsule.getPosition().x<.9,'the capsule is stopped short of the body');
});
