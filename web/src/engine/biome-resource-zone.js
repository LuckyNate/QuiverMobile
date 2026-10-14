import * as THREE from 'three';

// One D20 biome owns its resource cells, not terrain geometry or physics.
// Streaming works in a fixed tangent-plane grid; cell identity never depends on LOD.
export class BiomeResourceZone {
 constructor({biome,root,radius,height,distributor,host,cellSize=32,cellRadius=2}){
  Object.assign(this,{biome,root,radius,height,distributor,host,cellSize,cellRadius});
  this.origin=root.center.clone();
  const reference=Math.abs(this.origin.z)<.9?new THREE.Vector3(0,0,1):new THREE.Vector3(0,1,0);
  this.east=new THREE.Vector3().crossVectors(this.origin,reference).normalize();
  this.north=new THREE.Vector3().crossVectors(this.east,this.origin).normalize();
  this.loaded=new Map();
  this.reach=Math.max(...[root.a,root.b,root.c].map(v=>this.origin.angleTo(v)));
 }
 contains(direction){
  const corners=[this.root.a,this.root.b,this.root.c];
  let sign=0;
  for(let i=0;i<3;i++){
   const dot=new THREE.Vector3().crossVectors(corners[i],corners[(i+1)%3]).dot(direction);
   if(Math.abs(dot)<1e-10)continue;
   if(sign&&dot*sign<0)return false;
   sign=dot;
  }
  return true;
 }
 activeNear(position){
  const angle=this.origin.angleTo(position.clone().normalize());
  return angle<=this.reach+(this.cellSize*(this.cellRadius+2))/this.radius;
 }
 update(position){
  const dir=position.clone().normalize(),projection=this.origin.dot(dir);
  if(projection<=.1)return;
  const px=this.radius*this.east.dot(dir)/projection,py=this.radius*this.north.dot(dir)/projection;
  const cx=Math.floor(px/this.cellSize),cy=Math.floor(py/this.cellSize);
  const wanted=new Set();
  for(let dy=-this.cellRadius;dy<=this.cellRadius;dy++)
   for(let dx=-this.cellRadius;dx<=this.cellRadius;dx++){
    const x=cx+dx,y=cy+dy,key=x+','+y;
    wanted.add(key);
   }
  for(const [key,ids] of this.loaded){
   if(wanted.has(key))continue;
   // Let a falling/collecting resource finish its lifecycle before eviction.
   if(ids.some(id=>this.host.findTree(id)?.state==='falling'||
                  this.host.findTree(id)?.state==='fading'||
                  this.host.findTree(id)?.state==='flying'))continue;
   for(const id of ids)this.host.unloadTree(id);
   this.loaded.delete(key);
  }
  if(!this.activeNear(position))return;
  // At most one cell created per frame, nearest cell first.
  const next=[...wanted].filter(key=>!this.loaded.has(key)).sort((a,b)=>{
   const [ax,ay]=a.split(',').map(Number),[bx,by]=b.split(',').map(Number);
   return (ax-cx)**2+(ay-cy)**2-(bx-cx)**2-(by-cy)**2;
  })[0];
  if(!next)return;
  const [cellX,cellY]=next.split(',').map(Number),ids=[];
  for(const type of Object.keys(this.biome.resourceDensity)){
   if(this.biome.density(type)<=0)continue;
   const candidates=this.distributor.candidates({
    biome:'F'+String(this.biome.id).padStart(2,'0'),type,cellX,cellY,cellSize:this.cellSize,
    origin:this.origin,axisX:this.east,axisY:this.north,
    sampleSurface:(origin,east,north,x,y)=>{
     const direction=origin.clone().addScaledVector(east,x/this.radius)
      .addScaledVector(north,y/this.radius).normalize();
     if(!this.contains(direction))return null;
     const elevation=this.height.height(direction);
     if(elevation<3)return null;
     return direction.multiplyScalar(this.radius+elevation).toArray();
    }
   });
   for(const candidate of candidates){
    if(type!=='tree')continue; // Other resource visuals will register by type later.
    const at=new THREE.Vector3(...candidate.position);
    if(at.distanceTo(position)<6)continue;
    if(this.host.spawnTree(candidate.id,at,cellX+':'+cellY))ids.push(candidate.id);
   }
  }
  this.loaded.set(next,ids);
 }
}
