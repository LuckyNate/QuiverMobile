import {TerrainHeight} from './engine/terrain-height.js';
import {WorldOctree} from './engine/world-octree.js';
import {ImplicitSphere} from './engine/implicit-sphere.js';
import {SphereSurface} from './engine/sphere-surface.js';

// World owns the spatial index and solid planet construction.
// Do not mix renderer terrain, sea level or input into collision geometry.
export class WorldSystem {
 constructor(radius,playerPosition,height=new TerrainHeight()){
  this.height=height;
  this.octree=new WorldOctree({center:[0,0,0],halfSize:16384,maxDepth:15});
  this.octree.insert('player',{min:playerPosition.toArray().map(v=>v-.95),max:playerPosition.toArray().map(v=>v+.95)},{kind:'player',owner:'player'});
  this.solidity=new ImplicitSphere(radius,{halfSize:16384,minCell:1,height});
  this.surface=new SphereSurface(radius,{step:1,height});
 }
}
