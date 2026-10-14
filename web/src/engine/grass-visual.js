import * as THREE from 'three';

// Grass reuses the verified seeded resource spawn path. Only its visual changes:
// two intersecting, double-sided transparent planes instead of debug cubes.
export class GrassVisual {
 constructor(){
  this.geometry=new THREE.PlaneGeometry(1,1.2,1,5);
  this.geometry.translate(0,.6,0);
  const texture=new THREE.TextureLoader().load(import.meta.env.BASE_URL+'grass.svg');
  texture.colorSpace=THREE.SRGBColorSpace;
  this.material=new THREE.MeshBasicMaterial({
   map:texture,side:THREE.DoubleSide,transparent:true,alphaTest:.25,
   depthWrite:true
  });
 }
 create(position){
  const group=new THREE.Group();
  group.position.copy(position);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),position.clone().normalize());
  const blades=new THREE.Group();
  const mesh=new THREE.Mesh(this.geometry,this.material);
  const crossed=new THREE.Mesh(this.geometry,this.material);
  crossed.rotation.y=Math.PI/2;
  blades.add(mesh,crossed);
  group.add(blades);
  return {group,blades,mesh};
 }
 release(mesh){}
 update(dt){}
}
