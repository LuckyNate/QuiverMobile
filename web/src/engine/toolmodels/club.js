import * as THREE from 'three';
import {WOOD,DARK,material,shaft,block} from './parts.js';

// Club: a plain wooden baton with a knot for a head, no metal at all.
export function buildClub(){
 const group=new THREE.Group();
 group.add(shaft(.86,.026,.28));
 const head=new THREE.Mesh(new THREE.CylinderGeometry(.058,.038,.32,6,1),material(WOOD));
 head.position.y=.66;
 group.add(head,block(.09,.03,.09,DARK,0,.58,0));
 return group;
}
