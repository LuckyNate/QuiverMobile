import * as THREE from 'three';
// Shared root triangle order for rendering, biome spawning and player placement.
const geometry=new THREE.IcosahedronGeometry(1,0);
const position=geometry.getAttribute('position');
export const D20_ROOT_CORNERS=Object.freeze(Array.from({length:20},(_,face)=>
 Object.freeze([0,1,2].map(i=>new THREE.Vector3().fromBufferAttribute(position,face*3+i).normalize()))
));
geometry.dispose();
export function containsSphericalTriangle(direction,corners){
 for(let i=0;i<3;i++){
  const plane=new THREE.Vector3().crossVectors(corners[i],corners[(i+1)%3]);
  const inward=Math.sign(plane.dot(corners[(i+2)%3]));
  if(inward&&inward*plane.dot(direction)<-1e-10)return false;
 }
 return true;
}
export function faceAtDirection(direction){
 for(let face=0;face<20;face++)
  if(containsSphericalTriangle(direction,D20_ROOT_CORNERS[face]))return face;
 let best=0,score=-Infinity;
 for(let face=0;face<20;face++){
  const align=D20_ROOT_CORNERS[face].reduce((sum,p)=>sum+p.dot(direction),0);
  if(align>score){score=align;best=face;}
 }
 return best;
}
