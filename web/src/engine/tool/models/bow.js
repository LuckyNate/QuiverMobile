import * as THREE from 'three';
import {WOOD,EDGE,material} from './parts.js';

// Bow: a half-arc stave whose middle sits in the fist, with a straight string
// across the chord. Arrows are ammunition, so none are drawn here.
export function buildBow(){
 const group=new THREE.Group();
 const limbs=new THREE.Mesh(new THREE.TorusGeometry(.38,.016,4,14,Math.PI),material(WOOD));
 limbs.rotation.z=-Math.PI/2;
 limbs.position.x=-.38;
 const string=new THREE.Mesh(new THREE.BoxGeometry(.008,.76,.008),material(EDGE));
 string.position.x=-.38;
 group.add(limbs,string);
 return group;
}
