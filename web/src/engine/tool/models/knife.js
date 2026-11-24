import * as THREE from 'three';
import {STEEL,EDGE,shaft,block} from './parts.js';

// Knife: a hand's length of handle with a slim blade continuing out of it.
export function buildKnife(){
 const group=new THREE.Group();
 group.add(shaft(.22,.021,.05));
 group.add(block(.026,.2,.05,STEEL,0,.28,.01));
 group.add(block(.02,.1,.036,EDGE,0,.33,.01));
 return group;
}
