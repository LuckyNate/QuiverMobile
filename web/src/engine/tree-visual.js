import * as THREE from 'three';

// Owns tree meshes only; resource identity, persistence and physics live elsewhere.
export class TreeVisual {
 constructor(trunkMaterial,leafMaterial){
  this.trunkMaterial=trunkMaterial;
  this.leafMaterial=leafMaterial;
 }
 create(position){
  const tree=new THREE.Group();
  tree.position.copy(position);
  tree.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),position.clone().normalize());
  const visual=new THREE.Group();
  tree.add(visual);
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.24,.31,4,8),this.trunkMaterial);
  trunk.position.y=2;
  const foliage=new THREE.Mesh(new THREE.ConeGeometry(1.35,4.5,8),this.leafMaterial.clone());
  foliage.position.y=3.25;
  visual.add(trunk,foliage);
  return {tree,visual,trunk,foliage};
 }
}
