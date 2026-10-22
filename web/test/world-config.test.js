import test from 'node:test';
import assert from 'node:assert/strict';
import {WORLD_SETUP,WORLD_SCALE,BIOME_SETUP,STARTER_BIOME_FACE,terrainLodAtHorizontalDistance} from '../src/engine/world-config.js';
test('tiny world scale retains 1m terrain',()=>{
 assert.equal(WORLD_SETUP.rootEdgeMeters,256);
 assert.equal(WORLD_SETUP.terrainLodBandMeters,20);
 assert.equal(WORLD_SCALE.maxTerrainLod,8);
 assert.equal(WORLD_SCALE.octreeHalfSize,512);
 assert.equal(WORLD_SCALE.octreeMaxDepth,10);
 assert.ok(WORLD_SCALE.diameter>480&&WORLD_SCALE.diameter<490);
});
test('Meadows alone populated, others colored and empty',()=>{
 assert.equal(BIOME_SETUP.length,20);
 assert.equal(BIOME_SETUP[STARTER_BIOME_FACE].name,'Meadows');
 assert.ok(BIOME_SETUP[STARTER_BIOME_FACE].resourceDensity.tree>0);
 const empty=BIOME_SETUP.filter(b=>b.id!==STARTER_BIOME_FACE);
 assert.equal(empty.length,19);
 assert.equal(new Set(empty.map(b=>b.groundColor)).size,19);
 for(const b of empty)assert.deepEqual(b.resourceDensity,{});
});

test('20m horizontal rings select each LOD from 8 to 0',()=>{
 for(const [distance,level] of [[0,8],[19.99,8],[20,7],[39.99,7],[40,6],[60,5],[80,4],[100,3],[120,2],[140,1],[159.99,1],[160,0],[300,0]])
  assert.equal(terrainLodAtHorizontalDistance(distance),level,`${distance}m`);
});
