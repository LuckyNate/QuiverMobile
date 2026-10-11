import Box3D from 'box3d-wasm';

// Initial static-proxy proof. The octree remains authoritative; physics owns contact response.
// Each dynamic object owns its penetration check, teleport and spatial registration.
export class DynamicSolidBody {
 constructor(body,solidity,octree,id,shape,size){
  this.body=body;this.solidity=solidity;this.octree=octree;
  this.id=id;this.shape=shape;this.size=size;
 }
 getPosition(){return this.body.getPosition();}
 getRotation(){return this.body.getRotation();}
 getLinearVelocity(){return this.body.getLinearVelocity();}
 setLinearVelocity(value){this.body.setLinearVelocity(value);}
 setAwake(value){this.body.setAwake(value);}
 checkSolidity(){
  const p=this.body.getPosition(),q=this.body.getRotation();
  // Transform local sample points with the body's actual rotation.
  const rotate=(x,y,z)=>{
   const tx=2*(q.y*z-q.z*y),ty=2*(q.z*x-q.x*z),tz=2*(q.x*y-q.y*x);
   return [x+q.w*tx+q.y*tz-q.z*ty,
           y+q.w*ty+q.z*tx-q.x*tz,
           z+q.w*tz+q.x*ty-q.y*tx];
  };
  const samples=[];
  if(this.shape==='capsule'){
   // Sphere centers of the capsule (the endpoints and midpoint).
   for(const y of [-this.size.halfHeight,0,this.size.halfHeight])
    samples.push({offset:rotate(0,y,0),padding:this.size.radius});
  }else{
   // All eight corners of the rotating box, not just its origin.
   const h=this.size.half;
   for(const x of [-h,h])for(const y of [-h,h])for(const z of [-h,h])
    samples.push({offset:rotate(x,y,z),padding:0});
  }
  let correction=0;
  for(const {offset,padding} of samples){
   const x=p.x+offset[0],y=p.y+offset[1],z=p.z+offset[2];
   const length=Math.hypot(x,y,z);
   if(length<1e-8)continue;
   const direction={x:x/length,y:y/length,z:z/length};
   const ground=this.solidity.height?.radius(direction,this.solidity.radius)??this.solidity.radius;
   correction=Math.max(correction,ground+padding+.02-length);
  }
  if(correction>0){
   const length=Math.hypot(p.x,p.y,p.z);
   if(length>1e-8){
    const up={x:p.x/length,y:p.y/length,z:p.z/length};
    const next={x:p.x+up.x*correction,y:p.y+up.y*correction,z:p.z+up.z*correction};
    this.body.setPosition(next); // Box3D teleport; never sweep through solid terrain.
    const velocity=this.body.getLinearVelocity();
    const inward=Math.min(0,velocity.x*up.x+velocity.y*up.y+velocity.z*up.z);
    if(inward<0)this.body.setLinearVelocity({
     x:velocity.x-up.x*inward,y:velocity.y-up.y*inward,z:velocity.z-up.z*inward
    });
    this.body.setAwake(true);
   }
  }
  const now=this.body.getPosition();
  const extent=this.shape==='capsule'?this.size.halfHeight+this.size.radius:
   Math.sqrt(3)*this.size.half;
  const bounds={min:[now.x-extent,now.y-extent,now.z-extent],
   max:[now.x+extent,now.y+extent,now.z+extent]};
  if(this.octree.get(this.id))this.octree.update(this.id,bounds);
  else this.octree.insert(this.id,bounds,{kind:this.shape==='capsule'?'player':'dynamic',owner:this.id});
 }
}

export class PhysicsWorld {
 async init() {
  const b3=await Box3D();
  this.b3=b3;
  this.world=new b3.World({gravity:{x:0,y:-9.81,z:0}});
  this.staticBodies=new Map();
  this.dynamicObjects=[];
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
   const boxes=tree.query(bounds);
   this.staticRegionCache[i]={bounds,boxes};
   dirty=true;
  }
  if(!dirty)return;
  const wanted=new Map();
  for(const cached of this.staticRegionCache)for(const entry of cached.boxes)wanted.set(entry.id,entry);
  for(const [id,entry] of wanted)if(!this.staticBodies.has(id)){
   const body=this.world.createBody({type:'static',position:{x:0,y:0,z:0}});
   body.createHull({points:entry.points.map(([x,y,z])=>({x,y,z})),friction:.7});
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
 addPlayerCapsule(position,solidity,octree,id='player') {
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
  const object=new DynamicSolidBody(body,solidity,octree,id,'capsule',{halfHeight:.55,radius:.35});
  this.dynamicObjects.push(object);
  object.checkSolidity();
  return object;
 }
 movePlayer(body,direction,speed,up) {
  const velocity=body.getLinearVelocity();
  const radial=velocity.x*up.x+velocity.y*up.y+velocity.z*up.z;
  body.setLinearVelocity({x:direction.x*speed+up.x*radial,y:direction.y*speed+up.y*radial,z:direction.z*speed+up.z*radial});
  body.setAwake(true);
 }
 addDynamicBox(position,half=.3,solidity,octree,id) {
  const body=this.world.createBody({type:'dynamic',position:{x:position[0],y:position[1],z:position[2]}});
  body.createBox({halfExtents:{x:half,y:half,z:half},density:1,friction:.5});
  const object=new DynamicSolidBody(body,solidity,octree,id,'box',{half});
  this.dynamicObjects.push(object);
  object.checkSolidity();
  return object;
 }
 step(dt) {
  this.accumulator=Math.min(.15,this.accumulator+dt);
  while(this.accumulator>=1/60){
   this.world.step(1/60,4);
   for(const object of this.dynamicObjects)object.checkSolidity();
   this.accumulator-=1/60;
  }
 }
}
