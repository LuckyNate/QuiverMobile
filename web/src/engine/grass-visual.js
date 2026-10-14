import * as THREE from 'three';

// Temporary grass spawn diagnostic: one clearly visible white cube per
// seeded grass resource. No GLB, texture, transparency or wind involved.
export class GrassVisual {
 constructor(){
  this.geometry=new THREE.BoxGeometry(1,1,1);
  this.geometry.translate(0,.5,0);
  this.material=new THREE.MeshBasicMaterial({color:0xffffff});
 }
 create(position){
  const group=new THREE.Group();
  group.position.copy(position);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),position.clone().normalize());
  const blades=new THREE.Group();
  const mesh=new THREE.Mesh(this.geometry,this.material);
  blades.add(mesh);
  group.add(blades);
  return {group,blades,mesh};
 }
 release(mesh){}
 update(dt){}
}
