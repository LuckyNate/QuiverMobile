import Box3D from 'box3d-wasm';

// Initial static-proxy proof. The octree remains authoritative; physics owns contact response.
export class PhysicsWorld {
 async init() {
  const b3=await Box3D();
  this.b3=b3;
  this.world=new b3.World({gravity:{x:0,y:-9.81,z:0}});
  this.staticBodies=new Map();
  this.staticRegionCache=[];
  this.accumulator=0;
  return this;
 }
 // Check actor regions every frame. Query occupancy only on crossing the
 // cached region margin, and incrementally add/remove changed Box3D proxies.
 syncStatic(tree,queryBounds){
  const areas=Array.isArray(queryBounds)?queryBounds:[queryBounds];
  const margin=.5;
  let dirty=this.staticRegionCache.length!==areas.length;
  if(dirty)this.staticRegionCache.length=areas.length;
  for(let i=0;i<areas.length;i++){
   const area=areas[i],cached=this.staticRegionCache[i];
   const inside=cached&&area.min.every((v,k)=>v>=cached.bounds.min[k]&&area.max[k]<=cached.bounds.max[k]);
   if(inside)continue;
   const bounds={min:area.min.map(v=>v-margin),max:area.max.map(v=>v+margin)};
   const boxes=tree.query(bounds,{kinds:['static']}).filter(e=>e.shape==='box');
   this.staticRegionCache[i]={bounds,boxes};
   dirty=true;
  }
  if(!dirty)return;
  const wanted=new Map();
  for(const cached of this.staticRegionCache)for(const entry of cached.boxes)wanted.set(entry.id,entry.box);
  for(const [id,box] of wanted)if(!this.staticBodies.has(id)){
   const c=box.min.map((v,i)=>(v+box.max[i])/2);
   const h=box.min.map((v,i)=>(box.max[i]-v)/2);
   const body=this.world.createBody({type:'static',position:{x:c[0],y:c[1],z:c[2]}});
   body.createBox({halfExtents:{x:h[0],y:h[1],z:h[2]},friction:.7});
   this.staticBodies.set(id,body);
  }
  // New support always exists before any stale proxy is retired.
  for(const [id,body] of this.staticBodies)if(!wanted.has(id)){
   body.destroy();this.staticBodies.delete(id);
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
 addPlayerCapsule(position) {
  const up=position.clone().normalize();
  // Orient Y-axis capsule to the local initial gravity normal.
  const y={x:0,y:1,z:0};
  const cross={x:up.z,z:-up.x,y:0};
  const w=1+up.y;
  let rotation;
  if(w<1e-6)rotation={x:1,y:0,z:0,w:0};
  else {const len=Math.hypot(cross.x,cross.y,cross.z,w);rotation={x:cross.x/len,y:cross.y/len,z:cross.z/len,w:w/len};}
  const body=this.world.createBody({type:'dynamic',position:{x:position.x,y:position.y,z:position.z},rotation,
   motionLocks:{angularX:true,angularY:true,angularZ:true},linearDamping:0.5});
  body.createCapsule({height:1.1,radius:.35,density:1,friction:.8});
  // Rounded-bevel, 0.8 m diameter physical sled under the capsule.
  // Its underside projects 2 cm below the capsule's lowest point.
  // A solid convex hull (not a coplanar visual circle).
  const points=[];
  for(let i=0;i<16;i++){
   const a=i*Math.PI/8,x=Math.cos(a),z=Math.sin(a);
   points.push({x:x*.32,y:-.925,z:z*.32});
   points.push({x:x*.4,y:-.88,z:z*.4});
   points.push({x:x*.32,y:-.835,z:z*.32});
  }
  body.createHull({points,density:.25,friction:.35});
  return body;
 }
 movePlayer(body,direction,speed,up) {
  const velocity=body.getLinearVelocity();
  const radial=velocity.x*up.x+velocity.y*up.y+velocity.z*up.z;
  body.setLinearVelocity({x:direction.x*speed+up.x*radial,y:direction.y*speed+up.y*radial,z:direction.z*speed+up.z*radial});
  body.setAwake(true);
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
