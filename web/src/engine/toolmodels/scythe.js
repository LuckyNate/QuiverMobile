import * as THREE from 'three';
import {STEEL,EDGE,shaft,block} from './parts.js';

// Scythe: metre-long snath with a blade that leaves the top, sweeps forward and
// hooks down, so it reads as a scythe rather than a stick with a knob on the end.
export function buildScythe(){
 const group=new THREE.Group();
 group.add(shaft(1,.022,.35));
 const blade=block(.028,.055,.66,STEEL,0,.84,.3);
 blade.rotation.x=-.55;
 const tip=block(.024,.05,.36,EDGE,0,.78,.66);
 tip.rotation.x=-1.4;
 group.add(blade,tip);
 return group;
}
