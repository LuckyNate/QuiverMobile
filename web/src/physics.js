import Box3D from 'box3d-wasm';

// Initial static-proxy proof. The octree remains authoritative; physics owns contact response.
// A dynamic body owns its placement, swept broad-phase and spatial registration.
// World solidity is queried; it does not reposition actors.
// Dynamic objects own placement, octree queries and collision-safe movement.
// The world heightfield is the sole static-ground authority.
export class DynamicSolidBody {
 constructor(world,body,solidity,octree,id,shape,size){
  Object.assign(this,{world,body,solidity,octree,id,shape,size});
  this.radius=shape==='capsule'?size.halfHeight+size.radius:Math.sqrt(3)*size.half;
  this.longest=shape==='capsule'?2*(size.halfHeight+size.radius):2*size.half;
 }
 getPosition(){return this.body.getPosition();}
 getRotation(){return this.body.getRotation();}
 getLinearVelocity(){return this.body.getLinearVelocity();}
 setLinearVelocity(v){this.body.setLinearVelocity(v);}
 setAwake(v){this.body.setAwake(v);}
 bounds(p){
  const r=this.radius;
  return {min:[p.x-r,p.y-r,p.z-r],max:[p.x+r,p.y+r,p.z+r]};
 }
 candidates(from,to=from){
  const a=this.bounds(from),b=this.bounds(to);
  return this.octree.query({
   min:a.min.map((v,i)=>Math.min(v,b.min[i])),
   max:a.max.map((v,i)=>Math.max(v,b.max[i]))
  },{exclude:this.id,kinds:['dynamic','player']});
 }
 // Conservative full-shape terrain clearance, independent of rendered triangles.
 terrainClear(p){
  return this.solidity.clearSphere(p,this.radius);
 }
 clear(p,neighbors=this.candidates(p)){
  if(!this.terrainClear(p))return false;
  for(const entry of neighbors){
   const other=this.world.objects.get(entry.id);
   if(!other)continue;
   const q=other.getPosition();
   if(Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z)<this.radius+other.radius+.001)return false;
  }
  return true;
 }
 chooseSpawn(initial){
  const length=Math.hypot(initial.x,initial.y,initial.z);
  if(length<1e-6)throw new Error('Spawn position is at the planet center');
  const n={x:initial.x/length,y:initial.y/length,z:initial.z/length};
  for(let step=0;step<=2048;step+=.25){
   const p={x:initial.x+n.x*step,y:initial.y+n.y*step,z:initial.z+n.z*step};
   if(this.clear(p))return p;
  }
  throw new Error('No unoccupied spawn location for '+this.id);
 }
 register(){
  const p=this.getPosition(),bounds=this.bounds(p);
  if(this.octree.get(this.id))this.octree.update(this.id,bounds);
  else this.octree.insert(this.id,bounds,{kind:this.shape==='capsule'?'player':'dynamic',owner:this.id});
 }
 // Normal movement never teleports: only feasible displacement is passed
 // to Box3D. Iterate short segments to avoid tunneling at high speed.
 constrainVelocity(dt){
  const p=this.getPosition(),v=this.getLinearVelocity();
  const goal={x:p.x+v.x*dt,y:p.y+v.y*dt,z:p.z+v.z*dt};
  const neighbors=this.candidates(p,goal);
  const steps=Math.max(1,Math.ceil(Math.hypot(v.x,v.y,v.z)*dt/.15));
  let fraction=1;
  for(let i=1;i<=steps;i++){
   const t=i/steps,at={x:p.x+(goal.x-p.x)*t,y:p.y+(goal.y-p.y)*t,z:p.z+(goal.z-p.z)*t};
   if(!this.clear(at,neighbors)){fraction=(i-1)/steps;break;}
  }
  if(fraction<1){
   const up=this.world.up(p);
   const radial=v.x*up.x+v.y*up.y+v.z*up.z;
   const inward=Math.min(0,radial);
   // Preserve tangential movement for sliding; eliminate inward velocity
   // when terrain blocks it. Dynamic obstacles constrain the full step.
   if(!this.terrainClear(goal))this.body.setLinearVelocity({
    x:v.x-up.x*inward,y:v.y-up.y*inward,z:v.z-up.z*inward
   });
   else this.body.setLinearVelocity({x:v.x*fraction,y:v.y*fraction,z:v.z*fraction});
  }
 }
 // Position correction is not normal physics. Only use in an emergency.
 placeAt(p){
  const old=this.body,q=old.getRotation();
  if(typeof old.setTransform==='function')old.setTransform(p,q);
  else if(typeof old.setPosition==='function')old.setPosition(p);
  else{
   old.destroy();
   const options={type:'dynamic',position:p,rotation:q};
   if(this.shape==='capsule'){options.motionLocks={angularX:true,angularY:true,angularZ:true};options.linearDamping=.5;}
   const next=this.world.world.createBody(options);
   if(this.shape==='capsule')next.createCapsule({height:2*this.size.halfHeight,radius:this.size.radius,density:1,friction:.8});
   else next.createBox({halfExtents:{x:this.size.half,y:this.size.half,z:this.size.half},density:1,friction:.5});
   this.body=next;
  }
  this.body.setLinearVelocity({x:0,y:0,z:0});
  this.body.setAwake(true);
  this.register();
 }
 panicEscape(){
  const p=this.getPosition();
  if(this.clear(p))return false;
  const n=this.world.up(p),axis=Math.abs(n.z)<.9?{x:0,y:0,z:1}:{x:0,y:1,z:0};
  const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
  let t=cross(n,axis),length=Math.hypot(t.x,t.y,t.z);
  t={x:t.x/length,y:t.y/length,z:t.z/length};
  const b=cross(n,t),directions=[n];
  for(let ring=1;ring<=8;ring++)for(let j=0;j<24;j++){
   const theta=Math.PI*ring/8,phi=2*Math.PI*j/24,c=Math.cos(theta),s=Math.sin(theta);
   directions.push({x:c*n.x+s*(Math.cos(phi)*t.x+Math.sin(phi)*b.x),
    y:c*n.y+s*(Math.cos(phi)*t.y+Math.sin(phi)*b.y),
    z:c*n.z+s*(Math.cos(phi)*t.z+Math.sin(phi)*b.z)});
  }
  let chosen=null;
  for(const direction of directions){
   const at=d=>({x:p.x+direction.x*d,y:p.y+direction.y*d,z:p.z+direction.z*d});
   let lo=0,hi=.25;
   while(hi<65536&&!this.clear(at(hi))){lo=hi;hi*=2;}
   if(hi>=65536)continue;
   for(let i=0;i<18;i++){const mid=(lo+hi)/2;if(this.clear(at(mid)))hi=mid;else lo=mid;}
   const dest=at(hi+this.longest/2);
   if(this.clear(dest)&&(!chosen||hi<chosen.distance))chosen={distance:hi,dest};
  }
  if(!chosen)throw new Error('Cannot escape occupied space: '+this.id);
  this.placeAt(chosen.dest);
  return true;
 }
 validateStep(previous){
  const now=this.getPosition();
  if(!this.clear(now)){
   // If Box3D moved the actor illegally, use its previous legal pose.
   if(this.clear(previous))this.placeAt(previous);
   else this.panicEscape();
  }
  this.register();
 }
}

export class PhysicsWorld {
 async init() {
  const b3=await Box3D();
  this.b3=b3;
  this.world=new b3.World({gravity:{x:0,y:-9.81,z:0},enableContinuous:true});
  this.staticBodies=new Map();
  this.dynamicObjects=[];
  this.objects=new Map();
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
 up(p){
  const length=Math.hypot(p.x,p.y,p.z);
  if(length<1e-9)return {x:0,y:0,z:1};
  return {x:p.x/length,y:p.y/length,z:p.z/length};
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
  this.objects.set(id,object);
  object.register();
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
   for(const object of this.dynamicObjects){
    if(!object.clear(object.getPosition()))object.panicEscape();
    object.constrainVelocity(1/60);
   }
   this.world.step(1/60,4);
   for(let i=0;i<this.dynamicObjects.length;i++)
    this.dynamicObjects[i].validateStep(before[i]);
   this.accumulator-=1/60;
  }
 }
}
