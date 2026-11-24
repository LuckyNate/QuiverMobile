import {seededUnit} from '../world/seeded-hash.js';

// Read-only population density policy; never alters terrain or its LOD.
// Density is a count per 32 m resource cell: the unit the world spawns in, so the
// number written in the biome table is what one cell holds.
export class ResourceDensity {
 constructor({profiles={meadows:{tree:18,rock:2}},seed='QuiverGL'}={}){
  this.profiles=profiles;
  this.seed=String(seed);
 }
 get(biome,type){
  const density=this.profiles[biome]?.[type]??0;
  return Number.isFinite(density)?Math.max(0,density):0;
 }
 expected(biome,type){return this.get(biome,type);}
 // Fixed coordinate hash; no Math.random() or dependency on active LOD.
 sample(type,x,y,z){return seededUnit(this.seed,type,x,y,z);}
}
