// Initial static-proxy proof. The octree remains authoritative; physics owns contact response.
// A dynamic body owns its placement, swept broad-phase and spatial registration.
// World solidity is queried; it does not reposition actors.
// Dynamic objects own placement, octree queries and collision-safe movement.
// The world heightfield is the sole static-ground authority.
import Box3D from 'box3d-wasm';
import {takeCampTeleport} from './camp-respawn.js';
import {DynamicSolidBody} from './physics-body.js';

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
 syncStatic(surface,queryBounds,solidity=null){
  const areas=Array.isArray(queryBounds)?queryBounds:[queryBounds];
  const margin=2; // Retain support across several meters of player travel.
  let dirty=this.staticRegionCache.length!==areas.length;
  if(dirty)this.staticRegionCache.length=areas.length;
  for(let i=0;i<areas.length;i++){
   const area=areas[i],cached=this.staticRegionCache[i];
   if(cached&&area.min.every((v,k)=>v>=cached.bounds.min[k]&&area.max[k]<=cached.bounds.max[k]))continue;
   const bounds={min:area.min.map(v=>v-margin),max:area.max.map(v=>v+margin)};
   // Reject outer space and all-solid/empty regions before surface sampling.
   const potential=solidity?solidity.mayContainBoundary(bounds):true;
   this.staticRegionCache[i]={bounds,boxes:potential?surface.query(bounds):[]};
   dirty=true;
  }
  if(!dirty)return;
  const wanted=new Map();
  for(const region of this.staticRegionCache)for(const entry of region.boxes)wanted.set(entry.id,entry);
  // The procedural surface provides Box3D's real contacts.
  // Octree occupancy remains separate and never becomes a Box3D collision cube.
  for(const [id,entry] of wanted)if(!this.staticBodies.has(id)){
   const body=this.world.createBody({type:'static',position:{x:0,y:0,z:0}});
   body.createHull({points:entry.points.map(([x,y,z])=>({x,y,z})),friction:.7});
   this.staticBodies.set(id,body);
  }
  // Keep replacement support present before removing stale patches.
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
 movePlayer(body,direction,speed,up,dt=1/60) {
  const teleport=takeCampTeleport();
  if(teleport)body.placeAt(teleport);
  const velocity=body.getLinearVelocity(),knock=body.knockback;
  if(knock){
   knock.remaining=Math.max(0,knock.remaining-dt);
   if(knock.remaining===0)body.knockback=null;
  }
  const p=body.getPosition();
  const dot=direction.x*up.x+direction.y*up.y+direction.z*up.z;
  const tangent={x:direction.x-up.x*dot,y:direction.y-up.y*dot,z:direction.z-up.z*dot};
  const magnitude=Math.hypot(tangent.x,tangent.y,tangent.z);
  const radial=velocity.x*up.x+velocity.y*up.y+velocity.z*up.z;
  const kick=body.knockback?body.knockback.remaining/.18:0;
  if(magnitude<.001){
   body.setLinearVelocity({x:up.x*radial+(knock?.x||0)*kick,
    y:up.y*radial+(knock?.y||0)*kick,z:up.z*radial+(knock?.z||0)*kick});
   return;
  }
  const dir={x:tangent.x/magnitude,y:tangent.y/magnitude,z:tangent.z/magnitude};
  const groundAt=q=>{
   const length=Math.hypot(q.x,q.y,q.z);
   const n={x:q.x/length,y:q.y/length,z:q.z/length};
   return body.solidity.height?body.solidity.height.radius(n,body.solidity.radius):body.solidity.radius;
  };
  const currentGround=groundAt(p);
  const foot=Math.hypot(p.x,p.y,p.z)-(body.size.halfHeight+body.size.radius);
  const grounded=foot-currentGround<.4&&foot-currentGround>-.3;
  // Sixteen one-meter samples in a tangent-plane ring, recomputed each frame.
  // The ring spans every walking direction, not just forward.
  const ref=Math.abs(up.z)<.9?{x:0,y:0,z:1}:{x:0,y:1,z:0};
  const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
  const axisA=cross(up,ref),al=Math.hypot(axisA.x,axisA.y,axisA.z);
  const east={x:axisA.x/al,y:axisA.y/al,z:axisA.z/al},north=cross(up,east);
  const heights=new Array(16);
  for(let i=0;i<16;i++){
   const angle=i*Math.PI/8,c=Math.cos(angle),s=Math.sin(angle);
   heights[i]=groundAt({x:p.x+east.x*c+north.x*s,
    y:p.y+east.y*c+north.y*s,z:p.z+east.z*c+north.z*s});
  }
  const heading=(Math.atan2(dir.x*north.x+dir.y*north.y+dir.z*north.z,
   dir.x*east.x+dir.y*east.y+dir.z*east.z)+Math.PI*2)%(Math.PI*2);
  const index=heading*8/Math.PI,i0=Math.floor(index)%16;
  const forwardGround=heights[i0]*(1-(index-Math.floor(index)))+
   heights[(i0+1)%16]*(index-Math.floor(index));
  const slope=forwardGround-currentGround;
  const climbing=grounded&&slope>1&&slope<=2.5;
  const walkable=slope>=-1&&slope<=1;
  // Steep ground switches to a slower uphill scramble instead of freezing.
  // Box3D still resolves collisions; unsupported or sheer surfaces remain blocked.
  const horizontal=grounded&&!walkable&&!climbing?0:speed*magnitude*(climbing?.35:1);
  // Follow supported slopes. Gravity governs unsupported drops.
  const vertical=grounded&&(walkable||climbing)?slope*horizontal+(climbing?.18:0):radial;
  body.setLinearVelocity({
   x:dir.x*horizontal+up.x*vertical+(knock?.x||0)*kick,
   y:dir.y*horizontal+up.y*vertical+(knock?.y||0)*kick,
   z:dir.z*horizontal+up.z*vertical+(knock?.z||0)*kick
  });
  body.setAwake(true);
  return horizontal;
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
    if(object.shape!=='capsule'&&!object.clear(object.getPosition()))object.panicEscape();
    object.constrainVelocity(1/60);
   }
   this.world.step(1/60,4);
   for(let i=0;i<this.dynamicObjects.length;i++)
    this.dynamicObjects[i].validateStep(before[i]);
   this.accumulator-=1/60;
  }
 }
}
