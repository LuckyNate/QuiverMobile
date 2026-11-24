import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CreatureSystem} from '../../src/engine/creature/creature-system.js';
import {BOAR} from '../../src/engine/creature/boar.js';

const RADIUS=200,height={height:()=>10};
const surface=point=>point.clone().normalize().multiplyScalar(RADIUS+10);
const HOME=surface(new THREE.Vector3(0,0,1));

function fixture(){
 const root=new THREE.Group();
 const shared={getEntity:()=>null,setEntity:()=>{},awardResource:()=>{}};
 // Sixty metres off: nothing aggros, so the only thing that can move a boar is the
 // next one standing on it.
 const player={position:surface(new THREE.Vector3(0,0,1)).addScaledVector(new THREE.Vector3(1,0,0),60)};
 const system=new CreatureSystem({root,shared,player,playerId:'local-owner',height,radius:RADIUS});
 return {system,player};
}
const closest=system=>{
 const [a,b]=[...system.creatures()];
 return a.at.distanceTo(b.at);
};

test('two boars spawned on the same spot are pushed apart',()=>{
 const {system}=fixture();
 system.spawn('boar','F06:boar:0:0:0',HOME);
 system.spawn('boar','F06:boar:0:0:1',HOME);
 system.update(1/60,{tool:null});
 assert.ok(closest(system)>=BOAR.spacing*2-1e-3,'they never share a spot');
});

test('shoving a pair back together every frame cannot put them in one spot',()=>{
 const {system}=fixture();
 system.spawn('boar','F06:boar:0:0:0',HOME);
 system.spawn('boar','F06:boar:0:0:1',HOME);
 for(let i=0;i<30;i++){
  const [a,b]=[...system.creatures()];
  a.at.copy(b.at);
  system.update(1/60,{tool:null});
  assert.ok(closest(system)>=BOAR.spacing*2-1e-3,'the resolve pass keeps them apart');
 }
});
