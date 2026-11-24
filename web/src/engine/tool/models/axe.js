import * as THREE from 'three';
import {STEEL,EDGE,DARK,shaft,block} from './parts.js';

// Hatchet: short wooden handle, dark wedge head, bright cutting edge forward.
export function buildAxe(){
 const group=new THREE.Group();
 group.add(shaft(.62,.024,.21));
 group.add(block(.055,.15,.13,DARK,0,.5,.03));
 group.add(block(.04,.19,.11,EDGE,0,.5,.14));
 return group;
}
