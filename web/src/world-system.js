import {TerrainHeight} from './engine/terrain-height.js';
import {WorldOctree} from './engine/world-octree.js';
import {ImplicitSphere} from './engine/implicit-sphere.js';
import {SphereSurface} from './engine/sphere-surface.js';
import {ChunkedSurface} from './engine/chunked-surface.js';
import {WORLD_SETUP,WORLD_SCALE} from './engine/world-config.js';

// World owns the spatial index and solid planet construction.
// Do not mix renderer terrain, sea level or input into collision geometry.
export class WorldSystem {
 constructor(radius,playerPosition,height=new TerrainHeight()){
  this.height=height;
  // Root biomes are the 20 triangular D20 faces; cache chunks remain separate.
  this.octree=new WorldOctree({center:[0,0,0],halfSize:WORLD_SCALE.octreeHalfSize,maxDepth:WORLD_SCALE.octreeMaxDepth});
  this.solidity=new ImplicitSphere(radius,{halfSize:WORLD_SCALE.octreeHalfSize,minCell:WORLD_SETUP.collisionResolutionMeters,height});
  this.surface=new ChunkedSurface(new SphereSurface(radius,{step:WORLD_SETUP.collisionResolutionMeters,height}),{chunkSize:WORLD_SETUP.collisionChunkMeters,maxChunks:128}); // Deterministic on-demand surface chunks.
 }
}
