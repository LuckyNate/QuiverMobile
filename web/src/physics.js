import Box3D from 'box3d-wasm';

// Initial static-proxy proof. The octree remains authoritative; physics owns contact response.
// A dynamic body owns its placement, swept broad-phase and spatial registration.
// World solidity is queried; it does not reposition actors.
export class DynamicSolidBody {
 constructor(world,body,solidity,octree,id,shape,size){
  this.world=world;this.body=body;this.solidity=solidity;this.octree=octree;
  this.id=id;this.shape=shape;this.size=size;
  this.radius=shape==='capsule'?size.halfHeight+size.radius:Math.sqrt(3)*size.half;
 }
 getPosition(){return this.body.getPosition();}
 getRotation(){return this.body.getRotation();}
 getLinearVelocity(){return this.body.getLinearVelocity();}
 setLinearVelocity(v){this.body.setLinearVelocity(v);}
 setAwake(v){this.body.setAwake(v);}
 boundsAt(p){
  const r=this.radius;
  return {min:[p.x-r,p.y-r,p.z-r],max:[p.x+r,p.y+r,p.z+r]};
 }
 // Broad phase is authoritative for choosing pairs; no global pairwise scan.
 candidates(from,to=from){
  const a=this.boundsAt(from),b=this.boundsAt(to);
  const swept={min:a.min.map((v,i)=>Math.min(v,b.min[i])),
   max:a.max.map((v,i)=>Math.max(v,b.max[i]))};
  return this.octree.query(swept,{exclude:this.id,kinds:['player','dynamic']});
 }
 // Check the entire swept volume, not just an endpoint. A bounding sphere
 // conservatively contains both the capsule and any orientation of the box.
 terrainClear(p){
  const d=Math.hypot(p.x,p.y,p.z);
  if(d<=this.radius)return false;
  const up={x:p.x/d,y:p.y/d,z:p.z/d};
  const height=this.solidity.height;
  const surface=height?height.radius(up,this.solidity.radius):this.solidity.radius;
  // Terrain varies over the footprint: sample tangent offsets as well.
  const axis=Math.abs(up.z)<.9?{x:0,y:0,z:1}:{x:0,y:1,z:0};
  let tx=up.y*axis.z-up.z*axis.y,ty=up.z*axis.x-up.x*axis.z,tz=up.x*axis.y-up.y*axis.x;
  const tlen=Math.hypot(tx,ty,tz);tx/=tlen;ty/=tlen;tz/=tlen;
  const bx=up.y*tz-up.z*ty,by=up.z*tx-up.x*tz,bz=up.x*ty-up.y*tx;
  let maxSurface=surface;
  for(const [a,b] of [[1,0],[-1,0],[0,1],[0,-1],[.707,.707],[-.707,.707],[.707,-.707],[-.707,-.707]]){
   const x=p.x+this.radius*(a*tx+b*bx),y=p.y+this.radius*(a*ty+b*by),z=p.z+this.radius*(a*tz+b*bz);
   const l=Math.hypot(x,y,z);
   if(height)maxSurface=Math.max(maxSurface,height.radius({x:x/l,y:y/l,z:z/l},this.solidity.radius));
  }
  return d-this.radius>=maxSurface+.02;
 }
 pairClear(p,candidates){
  for(const entry of candidates){
   const other=this.world.dynamicObjects.find(o=>o.id===entry.id);
   if(!other)continue;
   const at=other.getPosition();
   const distance=Math.hypot(p.x-at.x,p.y-at.y,p.z-at.z);
   if(distance<this.radius+other.radius+.001)return false;
  }
  return true;
 }
 clear(p,candidates){return this.terrainClear(p)&&this.pairClear(p,candidates);}
 // Spawning is never allowed in occupied space. Search outward before activation.
 chooseSpawn(initial){
  const d=Math.hypot(initial.x,initial.y,initial.z);
  if(d<1e-6)throw new Error('Cannot spawn at the planet center');
  const up={x:initial.x/d,y:initial.y/d,z:initial.z/d};
  for(let i=0;i<=2048;i++){
   const at={x:initial.x+up.x*i,y:initial.y+up.y*i,z:initial.z+up.z*i};
   if(this.clear(at,this.candidates(at)))return at;
  }
  throw new Error('No unoccupied spawn position for '+this.id);
 }
 // Emergency only: if the current body is already embedded, escape in the
 // shortest sampled direction, then add half its longest dimension of clearance.
 panicEscape(){
  const origin=this.getPosition();
  if(this.terrainClear(origin))return false;
  const length=Math.hypot(origin.x,origin.y,origin.z);
  if(length<1e-6)throw new Error('Cannot determine escape direction at planet center');
  const up={x:origin.x/length,y:origin.y/length,z:origin.z/length};
  const reference=Math.abs(up.z)<.9?{x:0,y:0,z:1}:{x:0,y:1,z:0};
  const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
  const tangent=cross(up,reference),norm=Math.hypot(tangent.x,tangent.y,tangent.z);
  for(const k of ['x','y','z'])tangent[k]/=norm;
  const bitangent=cross(up,tangent);
  const directions=[up];
  // Search a full angular grid. Unlike a radial-only rescue this also considers
  // lateral exits from overhangs and other nonradial occupied regions.
  for(let ring=1;ring<=8;ring++){
   const angle=Math.PI*ring/8;
   for(let j=0;j<24;j++){
    const phi=2*Math.PI*j/24,c=Math.cos(angle),t=Math.sin(angle);
    directions.push({x:up.x*c+t*(tangent.x*Math.cos(phi)+bitangent.x*Math.sin(phi)),
     y:up.y*c+t*(tangent.y*Math.cos(phi)+bitangent.y*Math.sin(phi)),
     z:up.z*c+t*(tangent.z*Math.cos(phi)+bitangent.z*Math.sin(phi))});
   }
  }
  const longest=this.shape==='capsule'?2*(this.size.halfHeight+this.size.radius):2*this.size.half;
  const clearance=longest/2;
  const point=(direction,distance)=>({
   x:origin.x+direction.x*distance,y:origin.y+direction.y*distance,z:origin.z+direction.z*distance
  });
  let best=null;
  for(const direction of directions){
   let low=0,high=.25;
   while(high<=65536&&!this.terrainClear(point(direction,high))){low=high;high*=2;}
   if(high>65536)continue;
   for(let i=0;i<20;i++){
    const mid=(low+high)/2;
    if(this.terrainClear(point(direction,mid)))high=mid;else low=mid;
   }
   const destination=point(direction,high+clearance);
   if(!this.terrainClear(destination)||!this.pairClear(destination,this.candidates(origin,destination)))continue;
   if(!best||high<best.distance)best={distance:high,destination};
  }
  if(!best)throw new Error('No clear panic escape for '+this.id);
  this.placeAt(best.destination);
  return true;
 }
 // Use the available body transform API; replace the body only if necessary.
 placeAt(position){
  const body=this.body,rotation=body.getRotation();
  if(typeof body.setTransform==='function')body.setTransform(position,rotation);
  else if(typeof body.setPosition==='function')body.setPosition(position);
  else{
   body.destroy();
   const replacement=this.world.world.createBody({
    type:'dynamic',position,rotation,
    ...(this.shape==='capsule'?{motionLocks:{angularX:true,angularY:true,angularZ:true},linearDamping:.5}:{})
   });
   if(this.shape==='capsule')replacement.createCapsule({height:this.size.halfHeight*2,radius:this.size.radius,density:1,friction:.8});
   else replacement.createBox({halfExtents:{x:this.size.half,y:this.size.half,z:this.size.half},density:1,friction:.5});
   this.body=replacement;
  }
  this.body.setLinearVelocity({x:0,y:0,z:0});
  this.body.setAwake(true);
 }
 // Predict the swept path before stepping. Every collision candidate is
 // selected by the octree. Resolve by reducing the velocity, not by
 // allowing a body to travel through occupied space and teleporting afterward.
 constrainVelocity(dt){
  const p=this.getPosition(),v=this.getLinearVelocity();
  const dest={x:p.x+v.x*dt,y:p.y+v.y*dt,z:p.z+v.z*dt};
  const candidates=this.candidates(p,dest);
  const travel=Math.hypot(v.x*dt,v.y*dt,v.z*dt);
  const steps=Math.max(1,Math.ceil(travel/.2));
  let safe=1;
  for(let i=1;i<=steps;i++){
   const f=i/steps;
   const at={x:p.x+(dest.x-p.x)*f,y:p.y+(dest.y-p.y)*f,z:p.z+(dest.z-p.z)*f};
   if(!this.clear(at,candidates)){safe=(i-1)/steps;break;}
  }
  if(safe<1){
   // Retain safe displacement, stop the colliding component this step.
   this.body.setLinearVelocity({x:v.x*safe,y:v.y*safe,z:v.z*safe});
  }
 }
 // Verify any solver motion at the step boundary. Rewind an invalid step
 // instead of accepting an overlapping position.
 validateStep(previous){
  if(!this.terrainClear(previous))this.panicEscape();
  const now=this.getPosition();
  const candidates=this.candidates(previous,now);
  const travel=Math.hypot(now.x-previous.x,now.y-previous.y,now.z-previous.z);
  const steps=Math.max(1,Math.ceil(travel/.2));
  let valid=true;
  for(let i=1;i<=steps;i++){
   const f=i/steps;
   if(!this.clear({x:previous.x+(now.x-previous.x)*f,y:previous.y+(now.y-previous.y)*f,z:previous.z+(now.z-previous.z)*f},candidates)){
    valid=false;break;
   }
  }
  if(!valid){
   if(this.terrainClear(previous))this.placeAt(previous);
   else this.panicEscape();
  }
  const p=this.getPosition(),bounds=this.boundsAt(p);
  if(this.octree.get(this.id))this.octree.update(this.id,bounds);
  else this.octree.insert(this.id,bounds,{kind:this.shape==='capsule'?'player':'dynamic',owner:this.id});
 }
}

export class PhysicsWorld {
 async init() {
  const b3=await Box3D();
  this.b3=b3;
  this.world=new b3.World({gravity:{x:0,y:-9.81,z:0},enableContinuous:true});
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
  const spec={halfHeight:.55,radius:.35};
  // Validate first; no body exists until its complete occupied volume is clear.
  const object=new DynamicSolidBody(this,null,solidity,octree,id,'capsule',spec);
  const spawn=object.chooseSpawn(position);
  position.set(spawn.x,spawn.y,spawn.z);
  const length=Math.hypot(spawn.x,spawn.y,spawn.z);
  const up={x:spawn.x/length,y:spawn.y/length,z:spawn.z/length};
  const cross={x:up.z,y:0,z:-up.x},w=1+up.y;
  let rotation;
  if(w<1e-6)rotation={x:1,y:0,z:0,w:0};
  else {const l=Math.hypot(cross.x,cross.y,cross.z,w);rotation={x:cross.x/l,y:cross.y/l,z:cross.z/l,w:w/l};}
  const body=this.world.createBody({type:'dynamic',position:spawn,rotation,
   motionLocks:{angularX:true,angularY:true,angularZ:true},linearDamping:.5});
  body.createCapsule({height:1.1,radius:.35,density:1,friction:.8});
  object.body=body;
  this.dynamicObjects.push(object);
  object.validateStep(spawn);
  return object;
 }
 movePlayer(body,direction,speed,up) {
  const velocity=body.getLinearVelocity();
  const radial=velocity.x*up.x+velocity.y*up.y+velocity.z*up.z;
  body.setLinearVelocity({x:direction.x*speed+up.x*radial,y:direction.y*speed+up.y*radial,z:direction.z*speed+up.z*radial});
  body.setAwake(true);
 }
 addDynamicBox(position,half=.3,solidity,octree,id) {
  const object=new DynamicSolidBody(this,null,solidity,octree,id,'box',{half});
  const spawn=object.chooseSpawn({x:position[0],y:position[1],z:position[2]});
  const body=this.world.createBody({type:'dynamic',position:spawn});
  body.createBox({halfExtents:{x:half,y:half,z:half},density:1,friction:.5});
  object.body=body;
  this.dynamicObjects.push(object);
  object.validateStep(spawn);
  return object;
 }
 step(dt) {
  this.accumulator=Math.min(.15,this.accumulator+dt);
  while(this.accumulator>=1/60){
   const before=this.dynamicObjects.map(object=>object.getPosition());
   for(const object of this.dynamicObjects)object.constrainVelocity(1/60);
   this.world.step(1/60,4);
   for(let i=0;i<this.dynamicObjects.length;i++)
    this.dynamicObjects[i].validateStep(before[i]);
   this.accumulator-=1/60;
  }
 }
}
