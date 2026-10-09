import Box3D from 'box3d-wasm';

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
 // Only static occupied octree AABBs become Box3D collision bodies.
 syncStatic(tree,queryBounds){
  const wanted=new Map(tree.query(queryBounds,{kinds:['static']}).filter(e=>e.shape==='box').map(e=>[e.id,e.box]));
  for(const [id,body] of this.staticBodies)if(!wanted.has(id)){
   body.destroy?.();this.staticBodies.delete(id);
  }
  for(const [id,box] of wanted)if(!this.staticBodies.has(id)){
   const c=box.min.map((v,i)=>(v+box.max[i])/2);
   const h=box.min.map((v,i)=>(box.max[i]-v)/2);
   const body=this.world.createBody({type:'static',position:{x:c[0],y:c[1],z:c[2]}});
   body.createBox({halfExtents:{x:h[0],y:h[1],z:h[2]},friction:.7});
   this.staticBodies.set(id,body);
  }
 }
 setPlanetGravity(position) {
  const length=Math.hypot(position.x,position.y,position.z);
  if(length>0)this.world.setGravity({
   x:-9.81*position.x/length,
   y:-9.81*position.y/length,
   z:-9.81*position.z/length
  });
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
