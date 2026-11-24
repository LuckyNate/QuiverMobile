import * as THREE from 'three';

// Shared palette and primitives for the held tool models. Every model is built
// in the grip frame: fist at the origin, handle running up +y, working end at the
// top, so one hand anchor holds any of them.
export const WOOD=0x8a5a3b,STEEL=0x9aa3ab,EDGE=0xc3ccd3,DARK=0x555d66;

export const material=color=>new THREE.MeshStandardMaterial({color,roughness:.85,flatShading:true});

export function shaft(length,radius,y){
 const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,6,1),material(WOOD));
 mesh.position.y=y;
 return mesh;
}

export function block(width,height,depth,color,x,y,z){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),material(color));
 mesh.position.set(x,y,z);
 return mesh;
}
