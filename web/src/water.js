import * as THREE from 'three';

// Visual sea-level reference. No collisions, swimming or terrain deformation yet.
export class WorldWater {
 constructor(scene,terrainRadius,{seaLevelOffset=-1}={}){
  this.radius=terrainRadius+seaLevelOffset;
  this.geometry=new THREE.IcosahedronGeometry(this.radius,6);
  this.material=new THREE.MeshStandardMaterial({color:0x236c9d,roughness:.35,metalness:0,side:THREE.FrontSide});
  this.mesh=new THREE.Mesh(this.geometry,this.material);
  this.mesh.name='WorldWater';
  scene.add(this.mesh);
 }
}
