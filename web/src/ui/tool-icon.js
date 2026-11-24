import * as THREE from 'three';
import {toolModel} from '../engine/tool/models/index.js';

// Inventory slots show the tool you own rather than its name, so the grid reads
// at a glance. One small offscreen renderer draws each model once and the PNG is
// cached; without WebGL the caller falls back to the text it already has.
const SIZE=128;
// Flat tools are edge-on from the icon's front view, so they get turned to show
// their profile: the bow's curve and the scythe's sweep.
const PRESENT={bow:Math.PI/2,scythe:Math.PI/2};
const cache=new Map();
let renderer=null,scene=null,camera=null;

function setup(){
 const canvas=document.createElement('canvas');
 renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:true});
 renderer.setPixelRatio(Math.min(2,globalThis.devicePixelRatio||1));
 renderer.setSize(SIZE,SIZE,false);
 renderer.setClearColor(0,0);
 scene=new THREE.Scene();
 scene.add(new THREE.HemisphereLight(0xffffff,0x39485a,2.6));
 const sun=new THREE.DirectionalLight(0xffffff,2.2);
 sun.position.set(3,5,4);
 scene.add(sun);
 camera=new THREE.PerspectiveCamera(30,1,.01,50);
}

export function toolIcon(kind){
 if(!kind)return null;
 if(cache.has(kind))return cache.get(kind);
 let url=null;
 try{
  if(!renderer)setup();
  const model=toolModel(kind);
  if(model){
   // The hand owns the live model, so frame a copy and leave the original alone.
   const view=model.clone(true);
   // Laid diagonally: a scythe or torch stood bolt upright is a sliver at slot
   // size, while a diagonal reads as the whole tool.
   view.rotation.set(0,PRESENT[kind]??.55,-.62);
   const box=new THREE.Box3().setFromObject(view);
   const size=box.getSize(new THREE.Vector3());
   const centre=box.getCenter(new THREE.Vector3());
   const reach=Math.max(size.x,size.y,size.z);
   const distance=(reach/2)/Math.tan(THREE.MathUtils.degToRad(15))*1.02;
   camera.position.copy(centre).add(new THREE.Vector3(.5,.45,1).normalize().multiplyScalar(distance));
   camera.near=Math.max(.01,distance-reach);
   camera.far=distance+reach*2;
   camera.lookAt(centre);
   camera.updateProjectionMatrix();
   scene.add(view);
   renderer.render(scene,camera);
   scene.remove(view);
   url=renderer.domElement.toDataURL('image/png');
  }
 }catch(error){console.warn('Tool icon unavailable',error);}
 cache.set(kind,url);
 return url;
}
