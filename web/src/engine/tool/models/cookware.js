import * as THREE from 'three';
import {material} from './parts.js';

// The cookware every camp starts with. Each vessel is built in the grip frame
// like the tools — fist at the origin, body above it — so the same hand anchor
// holds a pot as holds an axe.
const CLAY=0xa9773f,DARK_CLAY=0x835a30;

// A cup: a small open beaker, wide enough to read at slot size.
export function buildCup(){
 const group=new THREE.Group();
 const body=new THREE.Mesh(new THREE.CylinderGeometry(.055,.045,.09,10,1,true),material(CLAY));
 body.position.y=.12;
 const base=new THREE.Mesh(new THREE.CircleGeometry(.045,10),material(DARK_CLAY));
 base.rotation.x=-Math.PI/2;
 base.position.y=.075;
 group.add(body,base);
 return group;
}

// A pot: a round belly, a dark rim and a bail handle over the top.
export function buildPot(){
 const group=new THREE.Group();
 const body=new THREE.Mesh(new THREE.CylinderGeometry(.12,.1,.16,12,1,true),material(CLAY));
 body.position.y=.16;
 const base=new THREE.Mesh(new THREE.CircleGeometry(.1,12),material(DARK_CLAY));
 base.rotation.x=-Math.PI/2;
 base.position.y=.08;
 const rim=new THREE.Mesh(new THREE.TorusGeometry(.12,.012,6,14),material(DARK_CLAY));
 rim.rotation.x=Math.PI/2;
 rim.position.y=.24;
 const handle=new THREE.Mesh(new THREE.TorusGeometry(.13,.007,5,12,Math.PI),material(DARK_CLAY));
 handle.position.y=.24;
 group.add(body,base,rim,handle);
 return group;
}

// A bowl: a wide shallow dish, so it is not mistaken for the cup in the hand.
export function buildBowl(){
 const group=new THREE.Group();
 const body=new THREE.Mesh(new THREE.CylinderGeometry(.13,.075,.075,12,1,true),material(CLAY));
 body.position.y=.12;
 const base=new THREE.Mesh(new THREE.CircleGeometry(.075,12),material(DARK_CLAY));
 base.rotation.x=-Math.PI/2;
 base.position.y=.083;
 group.add(body,base);
 return group;
}
