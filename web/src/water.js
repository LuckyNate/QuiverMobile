import * as THREE from 'three';

// Plain opaque sea-level mesh. No transparency, animation, or atmospheric effects.
export class WorldWater {
 constructor(scene,terrainRadius,{seaLevelOffset=-1}={}){
  this.radius=terrainRadius+seaLevelOffset;
  this.geometry=new THREE.IcosahedronGeometry(this.radius,6);
  this.material=new THREE.MeshBasicMaterial({color:0x236c9d,side:THREE.FrontSide});
  this.mesh=new THREE.Mesh(this.geometry,this.material);
  this.mesh.name='WorldWater';
  scene.add(this.mesh);
 }
 update(){}
}
