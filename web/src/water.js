import * as THREE from 'three';

// Independent visual sea level. Underwater appearance never affects solidity or Box3D.
export class WorldWater {
 constructor(scene,terrainRadius,{seaLevelOffset=-1}={}){
  this.radius=terrainRadius+seaLevelOffset;
  this.geometry=new THREE.IcosahedronGeometry(this.radius,6);
  this.material=new THREE.MeshStandardMaterial({
   color:0x236c9d,roughness:.35,metalness:0,side:THREE.DoubleSide,
   transparent:true,opacity:.68,depthWrite:false
  });
  this.mesh=new THREE.Mesh(this.geometry,this.material);
  this.mesh.name='WorldWater';
  this.mesh.renderOrder=1;
  scene.add(this.mesh);
  this.underwaterFog=new THREE.FogExp2(0x174958,.028);
  this.surfaceShader=null;
  // A small vertex displacement gives the surface movement without changing sea level physics.
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
 update(scene,camera,renderer,elapsed){
  if(this.surfaceShader)this.surfaceShader.uniforms.waterTime.value=elapsed;
  const depth=this.radius-camera.position.length();
  const underwater=depth>0;
  scene.fog=underwater?this.underwaterFog:null;
  renderer.setClearColor(underwater?0x174958:0x0a101c);
  // Water seen from below is less opaque than its surface from above.
  this.material.opacity=underwater?.26:.68;
 }
}
