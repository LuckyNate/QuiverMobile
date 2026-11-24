import * as THREE from 'three';
import {EDGE,DARK,shaft,block} from './parts.js';

// Hammer: long handle with a dark head and a bright face on each end.
export function buildHammer(){
 const group=new THREE.Group();
 group.add(shaft(.58,.023,.2));
 group.add(block(.1,.095,.2,DARK,0,.5,0));
 group.add(block(.055,.075,.055,EDGE,.06,.5,0));
 group.add(block(.055,.075,.055,EDGE,-.06,.5,0));
 return group;
}
