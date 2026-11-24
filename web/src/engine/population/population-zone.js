import * as THREE from 'three';
import {containsSphericalTriangle} from '../biome/biome-map.js';
import {PopulationBudget} from '../biome/biome-population.js';

// One D20 biome owns its population cells, not terrain geometry or physics.
// Streaming works in a fixed tangent-plane grid; cell identity never depends on
// LOD. Every inhabitant kind shares that grid, so trees, ground cover, creatures
// and anything else a face holds arrive, leave and come back by the same rule:
// a seeded slot, a density target, a tolerance dead band and a per-kind delay.
//
// The host supplies the live half of that contract:
//   kindsIn(biome)              the kinds this face carries, in table order
//   kind(type)                  one kind record (its respawn delay lives there)
//   spawn(type,id,at,context)   create the live object; false if it refuses
//   respawn(type,id,at,context) put a removed one back, clearing its record
//   alive(type,id)              still present and still collectable/killable
//   inTransition(id)            mid-collection, so eviction and respawn wait
//   unload(id)                  drop the live object when the cell goes away
//   removedAt(id)               the deadline already recorded, if any
//   noteRemoved(id,at)          persist that deadline so it survives a reload
export class PopulationZone {
 constructor({biome,root,radius,height,distributor,host,cellSize=32}){
  Object.assign(this,{biome,root,radius,height,distributor,host,cellSize});
  this.origin=root.center.clone();
  const reference=Math.abs(this.origin.z)<.9?new THREE.Vector3(0,0,1):new THREE.Vector3(0,1,0);
  this.east=new THREE.Vector3().crossVectors(this.origin,reference).normalize();
  this.north=new THREE.Vector3().crossVectors(this.east,this.origin).normalize();
  this.loaded=new Map();
  this.reach=Math.max(...[root.a,root.b,root.c].map(v=>this.origin.angleTo(v)));
  this.hasPopulation=this.host.kindsIn(biome).length>0;
 }
 contains(direction){
  return containsSphericalTriangle(direction,[this.root.a,this.root.b,this.root.c]);
 }
 activeNear(position,streamRadius){
  const angle=this.origin.angleTo(position.clone().normalize());
  return angle<=this.reach+(streamRadius+this.cellSize*2)/this.radius;
 }
 // One context for every kind: the grid position, not the type, names the cell.
 cellContext(cellX,cellY){
  return {biome:this.biome,cell:{x:cellX,y:cellY},cellKey:cellX+':'+cellY};
 }
 // slots: every seeded candidate of each kind, whether it spawned or not.
 // dead:  slot id → earliest millisecond it may return.
 record(context){
  return {context,ids:[],slots:new Map(),dead:new Map(),refilling:new Set()};
 }
 update(position,streamRadius,now=Date.now()){
  if(!this.hasPopulation)return;
  // Far biome faces cannot contribute to the nearby four LOD bands.
  if(!this.activeNear(position,streamRadius)){
   for(const [key,entry] of this.loaded){
    if(entry.ids.some(id=>this.host.inTransition(id)))continue;
    for(const id of entry.ids)this.host.unload(id);
    this.loaded.delete(key);
   }
   return;
  }
  const dir=position.clone().normalize(),projection=this.origin.dot(dir);
  if(projection<=.1)return;
  const px=this.radius*this.east.dot(dir)/projection,py=this.radius*this.north.dot(dir)/projection;
  const cx=Math.floor(px/this.cellSize),cy=Math.floor(py/this.cellSize);
  const wanted=new Set();
  const cellRadius=Math.ceil(streamRadius/this.cellSize)+1;
  for(let dy=-cellRadius;dy<=cellRadius;dy++)
   for(let dx=-cellRadius;dx<=cellRadius;dx++){
    const x=cx+dx,y=cy+dy;
    const closestX=Math.max(x*this.cellSize,Math.min(px,(x+1)*this.cellSize));
    const closestY=Math.max(y*this.cellSize,Math.min(py,(y+1)*this.cellSize));
    if((closestX-px)**2+(closestY-py)**2>streamRadius**2)continue;
    wanted.add(x+','+y);
   }
  for(const [key,entry] of this.loaded){
   if(wanted.has(key))continue;
   // Let a falling/collecting inhabitant finish its lifecycle before eviction.
   if(entry.ids.some(id=>this.host.inTransition(id)))continue;
   for(const id of entry.ids)this.host.unload(id);
   this.loaded.delete(key);
  }
  // At most one cell created per frame, nearest cell first.
  const next=[...wanted].filter(key=>!this.loaded.has(key)).sort((a,b)=>{
   const [ax,ay]=a.split(',').map(Number),[bx,by]=b.split(',').map(Number);
   return (ax-cx)**2+(ay-cy)**2-(bx-cx)**2-(by-cy)**2;
  })[0];
  if(next)this.loadCell(next,now);
  this.replenish(now);
 }
 loadCell(key,now){
  const [cellX,cellY]=key.split(',').map(Number);
  const context=this.cellContext(cellX,cellY),entry=this.record(context);
  // The biome table decides which kinds this face carries; the zone never names one.
  for(const kind of this.host.kindsIn(this.biome)){
   const candidates=this.distributor.candidates({
    biome:this.biome.key,type:kind.type,cellX,cellY,cellSize:this.cellSize,
    origin:this.origin,axisX:this.east,axisY:this.north,
    sampleSurface:(origin,east,north,x,y)=>{
     const direction=origin.clone().addScaledVector(east,x/this.radius)
      .addScaledVector(north,y/this.radius).normalize();
     if(!this.contains(direction))return null;
     const elevation=this.height.height(direction);
     if(!kind.habitat(elevation))return null;
     return direction.multiplyScalar(this.radius+elevation).toArray();
    }
   });
   if(!candidates.length)continue;
   const slots=[];
   for(const candidate of candidates){
    const at=new THREE.Vector3(...candidate.position);
    slots.push({id:candidate.id,position:at});
    // Seeded candidates must not be discarded just because the player is nearby;
    // a refused one is simply a slot waiting for its delayed return.
    if(this.host.spawn(kind.type,candidate.id,at,context))entry.ids.push(candidate.id);
   }
   entry.slots.set(kind.type,slots);
  }
  this.loaded.set(key,entry);
 }
 // Delayed replacement, one rule for every kind: a slot that is no longer alive
 // earns a deadline, and once the cell's shortfall passes its tolerance the ripe
 // slots come back one per frame. A felled tree, a picked stick and a killed boar
 // all replenish through here.
 replenish(now){
  for(const entry of this.loaded.values()){
   for(const [type,slots] of entry.slots){
    const kind=this.host.kind(type);
    if(!kind||!Number.isFinite(kind.respawnSeconds))continue;
    let live=0;
    for(const slot of slots){
     if(this.host.alive(type,slot.id)){entry.dead.delete(slot.id);live++;continue;}
     if(entry.dead.has(slot.id)||this.host.inTransition(slot.id))continue;
     const deadline=this.host.removedAt(slot.id)??now+kind.respawnSeconds*1000;
     entry.dead.set(slot.id,deadline);
     this.host.noteRemoved(slot.id,deadline);
    }
    const budget=new PopulationBudget({target:slots.length,tolerance:this.biome.tolerance(type)});
    if(budget.shouldRefill(live,entry.refilling.has(type)))entry.refilling.add(type);
    else entry.refilling.delete(type);
    if(!entry.refilling.has(type))continue;
    const ripe=slots.find(slot=>entry.dead.has(slot.id)&&entry.dead.get(slot.id)<=now&&
     !this.host.inTransition(slot.id));
    if(!ripe)continue;
    if(this.host.respawn(type,ripe.id,ripe.position,entry.context))entry.dead.delete(ripe.id);
    // A refused slot waits another delay rather than retrying every frame.
    else entry.dead.set(ripe.id,now+kind.respawnSeconds*1000);
   }
  }
 }
}
