import * as THREE from 'three';

// Animated visual sea surface; no underwater fog or atmospheric color changes.
export class WorldWater {
 constructor(scene,terrainRadius,{seaLevelOffset=-1}={}){
  this.radius=terrainRadius+seaLevelOffset;
  this.geometry=new THREE.IcosahedronGeometry(this.radius,6);
  this.material=new THREE.MeshStandardMaterial({
   color:0x236c9d,roughness:.35,metalness:0,
   side:THREE.FrontSide,transparent:true,opacity:.68,depthWrite:false
  });
  this.mesh=new THREE.Mesh(this.geometry,this.material);
  this.mesh.name='WorldWater';
  scene.add(this.mesh);
  this.surfaceShader=null;
  this.material.onBeforeCompile=shader=>{
   shader.uniforms.waterTime={value:0};
   shader.vertexShader='uniform float waterTime;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace(
    '#include <begin_vertex>',
    '#include <begin_vertex>\nfloat wave=0.12*sin(position.x*0.035+waterTime*0.65)*sin(position.y*0.029-waterTime*0.47);\ntransformed+=normalize(position)*wave;'
   );
   this.surfaceShader=shader;
  };
 }
 // Water occupies the gap between the radial seabed and sea level, never solid terrain.
 immersion(position,groundRadius,halfHeight=.75){
  if(groundRadius>=this.radius)return 0;
  const center=position.length();
  if(center<=groundRadius)return 0;
  return THREE.MathUtils.clamp((this.radius+halfHeight-center)/(halfHeight*2),0,1);
 }
 update(scene,camera,renderer,elapsed){
  if(this.surfaceShader)this.surfaceShader.uniforms.waterTime.value=elapsed;
  const underwater=camera.position.length()<this.radius;
  this.material.side=underwater?THREE.BackSide:THREE.FrontSide;
  this.material.opacity=underwater?.26:.68;
 }
}
