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
 // The octree supplies *only* nearby occupied entries. A triangle's AABB
 // is broad-phase metadata; its Box3D shape is a thin inward-facing prism.
 syncStatic(tree,queryBounds) {
  const wanted=new Map(tree.query(queryBounds,{kinds:['static']}).map(entry=>[entry.id,entry]));
  for(const [id,body] of this.staticBodies)if(!wanted.has(id)){
   body.destroy();this.staticBodies.delete(id);
  }
  for(const [id,entry] of wanted)if(!this.staticBodies.has(id)){
   const {box,shape,triangle}=entry;
   let body;
   if(shape==='triangle'&&triangle){
    const [a,b,c]=triangle;
    const n={
     x:(b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1]),
     y:(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]),
     z:(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    };
    const magnitude=Math.hypot(n.x,n.y,n.z);
    if(magnitude<1e-7)continue;
    const inward=[-n.x/magnitude*.2,-n.y/magnitude*.2,-n.z/magnitude*.2];
    const center=a.map((v,i)=>(v+b[i]+c[i])/3);
    const points=[a,b,c].flatMap(p=>[
     {x:p[0]-center[0],y:p[1]-center[1],z:p[2]-center[2]},
     {x:p[0]+inward[0]-center[0],y:p[1]+inward[1]-center[1],z:p[2]+inward[2]-center[2]}
    ]);
    body=this.world.createBody({type:'static',position:{x:center[0],y:center[1],z:center[2]}});
    body.createHull({points,friction:.7});
   }else if(shape==='box'){
    const center=box.min.map((v,i)=>(v+box.max[i])/2);
    const half=box.min.map((v,i)=>(box.max[i]-v)/2);
    body=this.world.createBody({type:'static',position:{x:center[0],y:center[1],z:center[2]}});
    body.createBox({halfExtents:{x:half[0],y:half[1],z:half[2]},friction:.7});
   }else continue;
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
