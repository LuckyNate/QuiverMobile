import * as THREE from 'three';

// Small silhouette refinement; retain the original low-poly GLB and animation rig.
export function refineAvatarShape(model){
 const torso=model.getObjectByName('Torso');
 const left=model.getObjectByName('Leg_L_Block');
 const right=model.getObjectByName('Leg_R_Block');
 if(!torso||!left||!right)return;
 // Separate a shallow pelvis from the shirt without replacing the animated legs.
 const hips=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),left.material);
 hips.name='Hips';
 hips.position.set(0,-.315,0);
 hips.scale.set(.39,.18,.235);
 model.add(hips);
 for(const leg of [left,right]){
  leg.scale.x*=1.08;
  leg.scale.z*=1.03;
  // A slight narrowing in the lower portion distinguishes thigh and shin.
  const geometry=leg.geometry.clone();
  const positions=geometry.getAttribute('position');
  for(let i=0;i<positions.count;i++){
   const y=positions.getY(i);
   if(y<0)positions.setX(i,positions.getX(i)*.94);
  }
  positions.needsUpdate=true;
  geometry.computeVertexNormals();
  leg.geometry=geometry;
 }
}
