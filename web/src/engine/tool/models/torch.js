import * as THREE from 'three';
import {material,shaft,block} from './parts.js';

// Torch: stick, a wrapped head and a warm tip. It lights the hand only; nothing
// here casts real light into the scene.
export function buildTorch(){
 const group=new THREE.Group();
 group.add(shaft(.5,.022,.18));
 group.add(block(.07,.09,.07,0x6b5a3a,0,.44,0));
 const flame=new THREE.Mesh(new THREE.ConeGeometry(.05,.13,6),material(0xffb055));
 flame.position.y=.55;
 group.add(flame);
 return group;
}
