import * as THREE from 'three';

// Owns seeded Meadows tree placement and replacement; terrain is queried only.
export class TreePopulation {
 constructor(host){this.host=host;}
 populate(){
  const h=this.host;
  for(const chunk of h.chunks){
   const cellX=chunk%2===0?-1:0,cellY=chunk<2?-1:0;
   const candidates=h.distributor.candidates({
    biome:'meadows',type:'tree',cellX,cellY,cellSize:32,
    origin:h.origin,axisX:h.east,axisY:h.north,
    sampleSurface:(origin,east,north,x,y)=>{
     const direction=origin.clone().addScaledVector(east,x/h.radius)
      .addScaledVector(north,y/h.radius).normalize();
     const elevation=h.height.height(direction);
     return elevation<3?null:direction.multiplyScalar(h.radius+elevation).toArray();
    }
   });
   let created=0;
   for(const candidate of candidates){
    const at=new THREE.Vector3(...candidate.position);
    if(at.distanceTo(h.player.position)<=6)continue;
    h.makeTree(chunk,created++,at);
   }
   h.targetByChunk.set(chunk,created);
  }
  for(const [id,saved] of h.shared?.entities||[]){
   if(!id.startsWith('meadows:tree:')||saved.state!=='standing'||saved.serial<256||!saved.position)continue;
   if(h.trees.some(t=>t.id===id))continue;
   h.makeTree(saved.chunk,saved.serial,new THREE.Vector3(...saved.position));
   h.nextSerial.set(saved.chunk,Math.max(h.nextSerial.get(saved.chunk)||256,saved.serial+1));
  }
 }
 respawn(){
  const h=this.host;
  for(const chunk of h.chunks){
   const live=h.trees.filter(t=>t.chunk===chunk&&t.state!=='collected').length;
   if(live>=Math.max(0,(h.targetByChunk.get(chunk)||0)-1))continue;
   const retired=h.trees.find(t=>t.chunk===chunk&&t.state==='collected'&&t.respawnTime===0);
   if(!retired)continue;
   for(let trial=0;trial<32;trial++){
    const serial=(h.nextSerial.get(chunk)||256)+trial;
    const at=h.location(chunk,serial);
    if(!at||!h.hiddenFromPlayers(at))continue;
    if(h.trees.some(t=>t.state!=='collected'&&t.at.distanceTo(at)<3))continue;
    h.makeTree(chunk,serial,at);
    h.nextSerial.set(chunk,serial+1);
    h.shared?.setEntity('meadows:tree:'+chunk+':'+serial,{state:'standing',chunk,serial,position:at.toArray()});
    break;
   }
  }
 }
}
