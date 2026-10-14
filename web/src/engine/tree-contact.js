import * as THREE from 'three';

// Resolves axe-authorized contacts against a Box3D-backed player body.
// Never writes terrain geometry, player positions, or terrain collision proxies.
export class TreeContact {
 constructor({getTool,onHit,interaction}){this.getTool=getTool;this.onHit=onHit;this.interaction=interaction;}
 update(trees,body,dt){
  if(!body)return;
  const equippedTool=this.getTool();
  if(equippedTool!=='axe')return;
  const position=body.getPosition(),velocity=body.getLinearVelocity();
  const p=new THREE.Vector3(position.x,position.y,position.z);
  for(const t of trees){
   if(t.state!=='standing'||!this.interaction.canContact(t.object,{equippedTool})||!t.object.acceptsContact('trunk',{equippedTool}))continue;
   t.bumpCooldown=Math.max(0,t.bumpCooldown-dt);
   const up=t.at.clone().normalize(),relative=p.clone().sub(t.at);
   const elevation=relative.dot(up);
   if(elevation<-.5||elevation>5.5)continue;
   const lateral=relative.addScaledVector(up,-elevation);
   const distance=lateral.length();
   const canopyRadius=elevation>=1&&elevation<=5.5?1.35*(5.5-elevation)/4.5:0;
   const contactRadius=Math.max(elevation<=4?.66:0,canopyRadius+.35);
   if(distance>=contactRadius||distance<.0001||t.bumpCooldown>0)continue;
   const normal=lateral.divideScalar(distance);
   const toward=velocity.x*normal.x+velocity.y*normal.y+velocity.z*normal.z;
   if(toward>=0)continue;
   const kick=Math.min(2,Math.max(.4,-toward*.35));
   body.setLinearVelocity({x:velocity.x+normal.x*(-toward+kick),
    y:velocity.y+normal.y*(-toward+kick),z:velocity.z+normal.z*(-toward+kick)});
   body.setAwake(true);
   body.knockback={x:normal.x*kick,y:normal.y*kick,z:normal.z*kick,remaining:.22};
   t.bumpCooldown=.25;
   this.onHit(t);
  }
 }
}
