import * as THREE from 'three';

// Owns resource collection transitions, not terrain or Box3D motion.
export class TreeLifecycle {
 constructor({scene,shared,player,onLocalLog}){
  Object.assign(this,{scene,shared,player,onLocalLog});
 }
 update(trees,dt){
  for(const t of trees){
   if(t.state==='falling'){
    t.progress=Math.min(1,t.progress+dt/1.1);
    t.visual.rotation.z=-Math.PI*.48*THREE.MathUtils.smoothstep(t.progress,0,1);
    if(t.progress>=1){t.state='fading';t.object.state='fading';t.progress=0;}
   }else if(t.state==='fading'){
    t.progress=Math.min(1,t.progress+dt/.7);
    t.foliage.material.opacity=1-t.progress;
    if(t.progress>=1){
     t.state='flying';t.object.state='flying';t.progress=0;t.foliage.visible=false;
     t.trunk.getWorldPosition(t.flightPosition=new THREE.Vector3());
     this.scene.add(t.trunk);
     t.trunk.position.copy(t.flightPosition);
     t.trunk.quaternion.copy(t.tree.quaternion).multiply(t.visual.quaternion);
     t.tree.visible=false;
    }
   }else if(t.state==='flying'){
    const owner=this.shared?.getPlayer(t.ownerId);
    const destination=owner?.position||this.player.position;
    if(!destination)continue;
    const target=new THREE.Vector3(destination.x,destination.y,destination.z);
    const delta=target.sub(t.trunk.position),distance=delta.length();
    const speed=8+Math.min(35,Math.max(0,30-distance));
    t.trunk.position.addScaledVector(delta,Math.min(1,speed*dt/Math.max(.001,distance)));
    t.trunk.scale.setScalar(Math.max(.03,Math.min(1,distance/8)));
    if(distance<.5){
     t.state='collected';t.object.state='collected';this.scene.remove(t.trunk);
     if(this.shared)this.shared.awardLog(t.ownerId,1);
     else this.onLocalLog();
     this.shared?.setEntity(t.id,{state:'collected',chunk:t.chunk,serial:t.serial});
     t.respawnTime=8;
    }
   }else if(t.state==='collected')t.respawnTime=Math.max(0,t.respawnTime-dt);
  }
 }
}
