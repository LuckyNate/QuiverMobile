import * as THREE from 'three';
import {EDGE,DARK,shaft,block} from './parts.js';

// Build hammer: a hammer on one side of the head and a hatchet on the other, so the
// same tool drives posts and logs and cuts the openings back out of a finished wall.
export function buildHammer(){
 const group=new THREE.Group();
 group.add(shaft(.58,.023,.2));
 group.add(block(.1,.095,.2,DARK,0,.5,0));
 group.add(block(.055,.075,.055,EDGE,.06,.5,0));
 group.add(block(.055,.075,.055,EDGE,-.06,.5,0));
 group.add(block(.06,.11,.11,DARK,0,.48,.14));
 group.add(block(.045,.15,.09,EDGE,0,.48,.22));
 return group;
}
