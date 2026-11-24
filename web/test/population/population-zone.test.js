import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {D20_ROOT_CORNERS} from '../../src/engine/biome/biome-map.js';
import {Biome} from '../../src/engine/biome/biome.js';
import {ResourceDensity} from '../../src/engine/biome/resource-density.js';
import {ResourceDistributor} from '../../src/engine/biome/resource-distributor.js';
import {PopulationZone} from '../../src/engine/population/population-zone.js';
import {SpawnRegistry} from '../../src/engine/population/spawn-registry.js';

const FACE=6,RADIUS=200,CELL=32,STREAM=8,TREE_DELAY=8,BOAR_DELAY=60;
const corners=D20_ROOT_CORNERS[FACE];
const root={a:corners[0].clone(),b:corners[1].clone(),c:corners[2].clone()};
root.center=root.a.clone().add(root.b).add(root.c).normalize();
// Flat dry ground everywhere, so habitat is never the reason a slot is skipped.
const height={height:()=>10,radius:(direction,r)=>r+10};
// Aim at the middle of one cell so the 8 m stream covers exactly that cell and
// the fixture never loads a neighbour mid-test.
const reference=Math.abs(root.center.z)<.9?new THREE.Vector3(0,0,1):new THREE.Vector3(0,1,0);
const east=new THREE.Vector3().crossVectors(root.center,reference).normalize();
const north=new THREE.Vector3().crossVectors(east,root.center).normalize();
const eye=root.center.clone().addScaledVector(east,CELL*.5/RADIUS)
 .addScaledVector(north,CELL*.5/RADIUS).normalize();

function fixture(){
 const registry=new SpawnRegistry();
 const live=new Set(),deadline=new Map(),respawned=[];
 let now=1000;
 const host={
  kind:type=>registry.get(type),
  kindsIn:biome=>biome.types().map(type=>registry.get(type))
   .filter(kind=>kind&&biome.density(kind.type)>0),
  spawn:(type,id)=>{
   // A slot still waiting on its deadline is not put back early.
   if((deadline.get(id)??0)>now)return false;
   live.add(id);return true;
  },
  respawn:(type,id)=>{respawned.push(id);deadline.delete(id);live.add(id);return true;},
  alive:(type,id)=>live.has(id),
  inTransition:()=>false,
  unload:id=>live.delete(id),
  removedAt:id=>deadline.get(id)??null,
  noteRemoved:(id,at)=>deadline.set(id,at)
 };
 const adapter={spawn:()=>true,unload:()=>true,
  alive:id=>live.has(id)};
 registry.register({type:'tree',category:'resource',respawnSeconds:TREE_DELAY,adapter});
 registry.register({type:'boar',category:'creature',respawnSeconds:BOAR_DELAY,adapter});
 const biome=new Biome({id:FACE,name:'Test',resources:{tree:2},creatures:{boar:1},
  tolerances:{tree:1,boar:0}});
 const zone=new PopulationZone({biome,root,radius:RADIUS,height,host,cellSize:CELL,
  distributor:new ResourceDistributor(new ResourceDensity({seed:'QuiverGL',profiles:{F06:{tree:2,boar:1}}}))});
 const tick=at=>{now=at;zone.update(eye,STREAM,at);};
 return {
  zone,live,respawned,deadline,tick,
  ids:type=>[...live].filter(id=>id.split(':')[1]===type),
  kill:at=>id=>{live.delete(id);deadline.set(id,at+(id.split(':')[1]==='boar'?BOAR_DELAY:TREE_DELAY)*1000);}
 };
}

test('one cell carries its resource and creature targets',()=>{
 const f=fixture();
 f.tick(1000);
 assert.equal(f.zone.loaded.size,1);
 assert.equal(f.ids('tree').length,2);
 assert.equal(f.ids('boar').length,1);
 assert.ok(f.ids('tree').every(id=>/^F06:tree:0:0:\d+$/.test(id)));
});

test('a shortfall inside the tolerance does not replenish',()=>{
 const f=fixture();
 f.tick(1000);
 const [tree]=f.ids('tree');
 f.kill(1000)(tree);
 f.tick(2000);
 f.tick(20000);
 assert.equal(f.ids('tree').length,1);
 assert.deepEqual(f.respawned,[]);
});

test('a resource returns only after its delay, then the cell refills',()=>{
 const f=fixture();
 f.tick(1000);
 const [first,second]=f.ids('tree');
 f.kill(1000)(first);
 f.kill(1000)(second);
 f.tick(2000);
 assert.deepEqual(f.respawned,[]);        // shortfall seen, nothing ripe yet
 f.tick(8999);
 assert.deepEqual(f.respawned,[]);        // still 1 ms early
 f.tick(9000);
 assert.deepEqual(f.respawned,[first]);   // one slot per frame
 assert.equal(f.ids('tree').length,1);
 f.tick(10000);
 assert.deepEqual(f.respawned,[first,second]);
 assert.equal(f.ids('tree').length,2);    // back to target, not target-tolerance
});

test('a creature respawns through the same delay',()=>{
 const f=fixture();
 f.tick(1000);
 const [boar]=f.ids('boar');
 f.kill(1000)(boar);
 f.tick(2000);
 assert.deepEqual(f.respawned,[]);
 f.tick(60999);
 assert.deepEqual(f.respawned,[]);
 f.tick(61000);
 assert.deepEqual(f.respawned,[boar]);
 assert.equal(f.ids('boar').length,1);
});
