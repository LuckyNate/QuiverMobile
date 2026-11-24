import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CreatureSystem} from '../../src/engine/creature/creature-system.js';

const RADIUS=200,ID='F06:boar:0:0:0';
const surface=point=>point.clone().normalize().multiplyScalar(RADIUS+10);
const SPAWN=surface(new THREE.Vector3(0,0,1));

function fixture(){
 const root=new THREE.Group();
 const awards=[];
 let saved=null,damage=0;
 const shared={getEntity:()=>saved,setEntity:(id,record)=>{saved=record;},
  awardResource:(id,type,count)=>awards.push([type,count])};
 // Eight metres away: outside the five metre aggro, so nothing happens by itself.
 const player={position:surface(new THREE.Vector3(0,0,1)).addScaledVector(new THREE.Vector3(1,0,0),8)};
 const system=new CreatureSystem({root,shared,player,playerId:'local-owner',
  height:{height:()=>10},radius:RADIUS,onPlayerDamage:()=>{damage++;}});
 system.spawn('boar',ID,SPAWN);
 const kill=()=>{for(const now of [0,1000,2000])system.strike(ID,'club',now);};
 return {system,awards,player,root,kill,taken:()=>damage};
}

test('three level 1 hits take three hit points and leave a carcass',()=>{
 const {system,kill}=fixture();
 assert.equal(system.get(ID).maxHealth,3);
 const hits=[];
 for(const now of [0,1000,2000])hits.push(system.strike(ID,'club',now));
 assert.deepEqual(hits.map(hit=>[hit.damage,hit.killed]),[[1,false],[1,false],[1,true]]);
 const boar=system.get(ID);
 assert.deepEqual([boar.health,boar.dead,boar.state],[0,true,'dead']);
 assert.equal(system.has(ID),true);       // death is not removal, the carcass stays
 kill();
});

test('a knife on the carcass yields bacon, hide and tusks',()=>{
 const {system,awards,kill}=fixture();
 kill();
 assert.deepEqual(system.get(ID).state,'dead');
 assert.deepEqual(system.harvest(ID),{rawBacon:1,hide:1,tusks:2});
 assert.deepEqual(awards,[['rawBacon',1],['hide',1],['tusks',2]]);
 assert.equal(system.has(ID),false);      // now the slot is free to respawn
 assert.equal(system.harvest(ID),null);   // and it only gives once
 assert.equal(awards.length,3);
});

test('a dead boar does not bite and finishes falling over',()=>{
 const {system,player,kill,taken}=fixture();
 kill();
 player.position.copy(system.get(ID).at);
 for(let i=0;i<120;i++)system.update(1/60,{tool:'club'});
 assert.equal(taken(),0);
 assert.equal(system.get(ID).tip,1);
});

test('a carcass waits ninety seconds, fades out and despawns',()=>{
 const {system,kill}=fixture();
 kill();
 system.update(89,{tool:null});
 assert.equal(system.has(ID),true);
 assert.equal(system.get(ID).fade,1);        // solid and lootable right up to the end
 system.update(1,{tool:null});
 assert.equal(system.get(ID).fade,1);        // ninety seconds: the fade has just begun
 system.update(.75,{tool:null});
 const boar=system.get(ID),item=system.visuals.boar.items.get(ID);
 assert.ok(boar.fade>0&&boar.fade<1);
 assert.ok(item.alpha>0&&item.alpha<1);
 assert.ok(item.solo,'the fading carcass owns a translucent copy of the material');
 system.update(1,{tool:null});
 assert.equal(system.has(ID),false);         // faded out, then gone
 assert.equal(system.visuals.boar.items.has(ID),false);
});

test('a carcass still gives its loot at the last second',()=>{
 const {system,awards,kill}=fixture();
 kill();
 system.update(89.9,{tool:null});
 assert.equal(system.has(ID),true);
 assert.deepEqual(system.harvest(ID),{rawBacon:1,hide:1,tusks:2});
 assert.deepEqual(awards,[['rawBacon',1],['hide',1],['tusks',2]]);
});

test('the health pip shows only while a weapon is in hand',()=>{
 const {system}=fixture();
 system.update(1/60,{tool:'club'});
 const pip=system.pips.items.get(ID);
 assert.equal(pip.group.visible,true);
 assert.ok(Math.abs(pip.fill.scale.x-1)<1e-9);
 system.strike(ID,'club',1000);
 system.update(1/60,{tool:'club'});
 assert.ok(Math.abs(pip.fill.scale.x-2/3)<1e-9);
 system.update(1/60,{tool:'axe'});
 assert.equal(pip.group.visible,false);
});
