import Box3D from 'box3d-wasm';
import { StaticAabbOctree } from './solidity.js';

// Initial static-proxy proof. The octree remains authoritative; physics owns contact response.
export class PhysicsWorld {
 async init() {
  const b3=await Box3D();
  this.b3=b3;
  this.world=new b3.World({gravity:{x:0,y:-9.81,z:0}});
  this.staticBodies=new Map();
  this.accumulator=0;
  return this;
 }
 syncStatic(octree,queryBounds) {
  const wanted=new Map(octree.query(queryBounds).map(entry=>[entry.id,entry.box]));
  for(const [id,body] of this.staticBodies)if(!wanted.has(id)){
   body.destroy?.(); this.staticBodies.delete(id);
  }
  for(const [id,box] of wanted)if(!this.staticBodies.has(id)){
   const center=box.min.map((v,i)=>(v+box.max[i])/2);
   const half=box.min.map((v,i)=>(box.max[i]-v)/2);
   const body=this.world.createBody({type:'static',position:{x:center[0],y:center[1],z:center[2]}});
   body.createBox({halfExtents:{x:half[0],y:half[1],z:half[2]}});
   this.staticBodies.set(id,body);
  }
 }
 addDynamicBox(position,half=.3) {
  const body=this.world.createBody({type:'dynamic',position:{x:position[0],y:position[1],z:position[2]}});
  body.createBox({halfExtents:{x:half,y:half,z:half},density:1,friction:.5});
  return body;
 }
 step(dt) {
  this.accumulator=Math.min(.15,this.accumulator+dt);
  while(this.accumulator>=1/60){this.world.step(1/60,4);this.accumulator-=1/60;}
 }
}
