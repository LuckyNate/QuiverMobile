import * as THREE from 'three';

// Axe-only player contacts against every current tree mesh component.
// The existing Box3D capsule remains the moving body; terrain is untouched.
export class TreeContact {
 constructor({getTool,onHit,interaction}){this.getTool=getTool;this.onHit=onHit;this.interaction=interaction;}
 update(trees,body,dt){
  if(!body)return;
  const equippedTool=this.getTool();
  if(equippedTool!=='axe')return;
  const position=body.getPosition(),velocity=body.getLinearVelocity();
  const p=new THREE.Vector3(position.x,position.y,position.z);
  // Matches the current Box3D player capsule (1.1 m straight section, r=.35).
  const halfHeight=body.size?.halfHeight??.55,radius=body.size?.radius??.35;
  for(const t of trees){
   if(t.state!=='standing'||!this.interaction.canContact(t.object,{equippedTool}))continue;
   t.bumpCooldown=Math.max(0,t.bumpCooldown-dt);
   const up=t.at.clone().normalize(),relative=p.clone().sub(t.at);
   const elevation=relative.dot(up);
   const lateral=relative.addScaledVector(up,-elevation);
   const distance=lateral.length();
   // Test the nearest heights of the actual trunk frustum and foliage cone.
   // A capsule can touch their bases, tips, and any intervening section;
   // the previous single-height test missed contacts at both ends.
   let hitPart=null,bestPenetration=0;
   const test=(part,lo,hi,shapeRadius)=>{
    const nearest=Math.max(lo,Math.min(hi,elevation));
    const heights=[lo,hi,nearest,Math.max(lo,Math.min(hi,elevation-halfHeight)),
     Math.max(lo,Math.min(hi,elevation+halfHeight))];
    const sampleCount=heights.length;
    for(let k=0;k<sampleCount-1;k++)heights.push((heights[k]+heights[k+1])*.5);
    for(const y of heights){
     const beyond=Math.max(0,Math.abs(y-elevation)-halfHeight);
     if(beyond>radius)continue;
     const capsuleRadius=Math.sqrt(Math.max(0,radius*radius-beyond*beyond));
     const penetration=shapeRadius(y)+capsuleRadius-distance;
     if(penetration>bestPenetration){bestPenetration=penetration;hitPart=part;}
    }
   };
   // CylinderGeometry(.24,.31,4): bottom=.31, top=.24, y=0..4.
   test('trunk',0,4,y=>.31-(.07*y/4));
   // ConeGeometry(1.35,4.5): base=1.0, tip=5.5.
   test('foliage',1,5.5,y=>1.35*(5.5-y)/4.5);
   if(!hitPart||!t.object.acceptsContact(hitPart,{equippedTool})||t.bumpCooldown>0)continue;
   const normal=distance>.0001?lateral.divideScalar(distance):new THREE.Vector3(velocity.x,velocity.y,velocity.z)
    .addScaledVector(up,-(velocity.x*up.x+velocity.y*up.y+velocity.z*up.z)).negate().normalize();
   if(normal.lengthSq()<.0001)continue;
   const toward=velocity.x*normal.x+velocity.y*normal.y+velocity.z*normal.z;
   if(toward>=0)continue;
   const kick=Math.min(2,Math.max(.4,-toward*.35));
   body.setLinearVelocity({x:velocity.x+normal.x*(-toward+kick),
    y:velocity.y+normal.y*(-toward+kick),z:velocity.z+normal.z*(-toward+kick)});
   body.setAwake(true);
   body.knockback={x:normal.x*kick,y:normal.y*kick,z:normal.z*kick,remaining:.22};
   t.bumpCooldown=.25;
   this.onHit(t,hitPart);
  }
 }
}
