import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

export class GrassVisual {
 constructor(){
  this.instances=new Set();
  this.geometry=null;
  this.fallback=new THREE.BoxGeometry(.9,1.15,.018,1,5,1);
  this.fallback.translate(0,.575,0);
  const texture=new THREE.TextureLoader().load(import.meta.env.BASE_URL+'grass.svg');
  texture.colorSpace=THREE.SRGBColorSpace;
  this.material=new THREE.MeshStandardMaterial({map:texture,transparent:true,
   alphaTest:.25,side:THREE.DoubleSide,roughness:1,depthWrite:true});
  this.windTime={value:0};
  this.material.onBeforeCompile=shader=>{
   shader.uniforms.windTime=this.windTime;
   shader.vertexShader=shader.vertexShader.replace('#include <common>',
    '#include <common>\nuniform float windTime;');
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
    '#include <begin_vertex>\ntransformed.x += pow(max(position.y,0.0),1.6)*0.09*sin(windTime*1.5+position.x*2.0+position.z);');
  };
  new GLTFLoader().load(import.meta.env.BASE_URL+'grass.glb',gltf=>{
   const mesh=gltf.scene.getObjectByName('GrassClump')||gltf.scene.getObjectByProperty('isMesh',true);
   if(!mesh?.geometry)return;
   this.geometry=mesh.geometry;
   for(const instance of this.instances)instance.geometry=this.geometry;
  },undefined,error=>console.warn('Grass GLB unavailable; retaining fallback',error));
 }
 create(position){
  const group=new THREE.Group();
  group.position.copy(position);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),position.clone().normalize());
  const blades=new THREE.Group(),mesh=new THREE.Mesh(this.geometry||this.fallback,this.material);
  blades.add(mesh);group.add(blades);this.instances.add(mesh);
  return {group,blades,mesh};
 }
 release(mesh){this.instances.delete(mesh);}
 update(dt){this.windTime.value+=dt;}
}