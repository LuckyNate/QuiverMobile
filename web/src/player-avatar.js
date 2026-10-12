import * as THREE from 'three';

// New placeholder player avatar, no GLB transforms or hidden offsets.
// Body center is at the physics capsule center; feet extend down the radial up axis.
export class PlayerAvatar {
 constructor(scene,report){
  const material=new THREE.MeshStandardMaterial({
   color:0xa3afbc,roughness:.8,metalness:0,transparent:true,opacity:.4,depthWrite:false
  });
  this.root=new THREE.Group();
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(.35,1.1,6,10),material);
  this.root.add(body);
  scene.add(this.root);
  this.animation='Idle';
  report('GLB player','READY','Procedural capsule (new avatar placeholder)');
 }
 show(state){this.animation=state;}
 update(position,up,forward){
  this.root.position.copy(position);
  const f=forward.clone().addScaledVector(up,-forward.dot(up)).normalize();
  const right=new THREE.Vector3().crossVectors(up,f).normalize();
  this.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,f));
 }
}
