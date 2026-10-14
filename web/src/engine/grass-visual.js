import * as THREE from 'three';

// Matches the working TreeVisual pattern: shared meshes and materials,
// one independently positioned and planet-aligned group per resource.
export class GrassVisual {
 constructor(){
  this.instances=new Set();
  const geometry=new THREE.BoxGeometry(.9,1.2,.02,1,5,1);
  geometry.translate(0,.6,0);
  this.geometry=geometry;
  this.windTime={value:0};
  const texture=new THREE.TextureLoader().load(import.meta.env.BASE_URL+'grass.png');
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.magFilter=THREE.LinearFilter;
  texture.minFilter=THREE.LinearMipmapLinearFilter;
  this.material=new THREE.MeshStandardMaterial({map:texture,transparent:true,
   alphaTest:.35,side:THREE.DoubleSide,roughness:1,depthWrite:true});
  this.material.onBeforeCompile=shader=>{
   shader.uniforms.windTime=this.windTime;
   shader.vertexShader=shader.vertexShader.replace('#include <common>',
    '#include <common>\nuniform float windTime;');
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
    '#include <begin_vertex>\ntransformed.x += pow(max(position.y,0.0),1.6)*0.12*sin(windTime*1.6+position.x*2.0+position.z*1.3);');
  };
  const blank=new THREE.MeshBasicMaterial({visible:false});
  this.materials=[this.material,this.material,blank,blank,this.material,this.material];
 }
 create(position){
  const group=new THREE.Group();
  group.position.copy(position);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),position.clone().normalize());
  const blades=new THREE.Group();
  const mesh=new THREE.Mesh(this.geometry,this.materials);
  blades.add(mesh);group.add(blades);this.instances.add(mesh);
  return {group,blades,mesh};
 }
 release(mesh){this.instances.delete(mesh);}
 update(dt){this.windTime.value+=dt;}
}
