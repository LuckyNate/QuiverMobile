import * as THREE from 'three';
import {faceAtDirection} from './biome-map.js';
import {WORLD_SETUP,STARTER_BIOME_FACE} from '../world/world-config.js';

// Select a deterministic dry, gently sloped Meadows starting location.
// The surrounding capsule footprint is sampled, not just the center point.
export class SpawnPoint {
 constructor({height,radius}){this.height=height;this.radius=radius;}
 find(){
  const radial=(latitude,longitude)=>{
   const c=Math.cos(latitude);
   return new THREE.Vector3(c*Math.cos(longitude),c*Math.sin(longitude),Math.sin(latitude));
  };
  let best=null,bestScore=Infinity;
  const height=this.height,radius=this.radius;
  const sea=radius+WORLD_SETUP.seaLevelOffsetMeters;
  for(let row=1;row<36;row++)for(let col=0;col<144;col++){
   const direction=radial(-Math.PI/2+Math.PI*row/36,2*Math.PI*col/144);
   if(faceAtDirection(direction)!==STARTER_BIOME_FACE)continue;
   const surface=height.radius(direction,radius);
   const elevation=surface-radius;
   // Low, green Meadows land, comfortably above the ocean.
   if(elevation<8||elevation>35||surface-sea<5)continue;
   const reference=Math.abs(direction.z)<.9?new THREE.Vector3(0,0,1):new THREE.Vector3(0,1,0);
   const east=new THREE.Vector3().crossVectors(direction,reference).normalize();
   const north=new THREE.Vector3().crossVectors(east,direction).normalize();
   let variation=0,valid=true;
   for(const [x,y] of [[4,0],[-4,0],[0,4],[0,-4],[3,3],[-3,-3]]){
    const neighbor=direction.clone().addScaledVector(east,x/radius)
     .addScaledVector(north,y/radius).normalize();
    const candidateRadius=height.radius(neighbor,radius);
    variation=Math.max(variation,Math.abs(candidateRadius-surface));
    if(candidateRadius-sea<4||Math.abs(candidateRadius-surface)>2){valid=false;break;}
   }
   if(!valid)continue;
   const score=variation*10+Math.abs(elevation-15);
   if(score<bestScore){best=direction;bestScore=score;}
  }
  if(!best)throw new Error('No suitable dry Meadows spawn in seeded terrain');
  // Full capsule has clearance; leave room for Box3D contact settling.
  return best.multiplyScalar(height.radius(best,radius)+2);
 }
}
