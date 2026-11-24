// Placement, swept neighbours, panic escape and step validation for one dynamic body.
// Ground truth comes from the procedural solid; the octree only accelerates queries.
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
  return this.octree.queryCells({
   min:a.min.map((v,i)=>Math.min(v,b.min[i])),
   max:a.max.map((v,i)=>Math.max(v,b.max[i]))
  },{exclude:this.id,kinds:['dynamic','player'],cellSize:1});
 }
 // Conservative full-shape terrain clearance, independent of rendered triangles.
 terrainClear(p){
  // Octree voxels accelerate lookup; never treat their centers as a
  // substitute for the full-resolution procedural solid boundary.
  return this.shape==='capsule'
   ?this.solidity.clearCapsule(p,this.size.halfHeight,this.size.radius)
   :this.solidity.clearSphere(p,this.radius);
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
 // Dynamic actors retain swept checks. The player uses slope-following
 // velocity and Box3D contacts rather than treating touching ground as a wall.
 constrainVelocity(dt){
  if(this.shape==='capsule')return;
  const p=this.getPosition(),v=this.getLinearVelocity();
  const goal={x:p.x+v.x*dt,y:p.y+v.y*dt,z:p.z+v.z*dt};
  const neighbors=this.candidates(p,goal);
  const steps=Math.max(1,Math.ceil(Math.hypot(v.x,v.y,v.z)*dt/.15));
  for(let i=1;i<=steps;i++){
   const t=i/steps,at={x:p.x+(goal.x-p.x)*t,y:p.y+(goal.y-p.y)*t,z:p.z+(goal.z-p.z)*t};
   if(!this.clear(at,neighbors)){this.body.setLinearVelocity({x:0,y:0,z:0});break;}
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
  if(this.shape==='capsule'){
   // The contact solver may have slight overlap at rest. Avoid teleporting
   // the player back downhill every time an uphill contact is registered.
   this.register();return;
  }
  if(!this.clear(now)){
   // If Box3D moved the actor illegally, use its previous legal pose.
   if(this.clear(previous))this.placeAt(previous);
   else this.panicEscape();
  }
  this.register();
 }
}

