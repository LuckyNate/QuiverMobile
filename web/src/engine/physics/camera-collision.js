// Kinematic camera AABB; its swept route is checked against terrain geometry.
// No Box3D body is required and visual LOD never changes the collision boundary.
export class CameraCollision {
 constructor(height,radius,{half=.3,skin=.16}={}){
  this.height=height;this.radius=radius;this.half=half;this.skin=skin;
  this.corners=[[0,0,0],[-1,-1,-1],[-1,-1,1],[-1,1,-1],[-1,1,1],
   [1,-1,-1],[1,-1,1],[1,1,-1],[1,1,1]];
 }
 clear(position){
  for(const [x,y,z] of this.corners){
   const px=position.x+x*this.half,py=position.y+y*this.half,pz=position.z+z*this.half;
   const d=Math.hypot(px,py,pz);
   if(d<1)return false;
   const normal={x:px/d,y:py/d,z:pz/d};
   if(d<this.height.radius(normal,this.radius)+this.skin)return false;
  }
  return true;
 }
 // The camera is allowed to approach its focus but never pass the first
 // obstructing hill. Return the nearest safe point along that sightline.
 resolve(focus,desired){
  const delta=desired.clone().sub(focus),distance=delta.length();
  if(distance<.001)return desired.clone();
  const from=.9/distance;
  if(from>=1)return this.clear(desired)?desired.clone():focus.clone();
  const point=t=>focus.clone().addScaledVector(delta,t);
  // The focus can be close to the ground; begin beyond the character's body.
  let safe=Math.max(0,from);
  if(!this.clear(point(safe))){
   let found=false;
   for(let i=1;i<=8;i++){
    const t=Math.min(1,safe+i*.25/distance);
    if(this.clear(point(t))){safe=t;found=true;break;}
   }
   if(!found)return focus.clone().addScaledVector(delta,Math.min(1,1.5/distance));
  }
  const steps=Math.min(128,Math.max(1,Math.ceil((distance*(1-safe))/.5)));
  let hit=1;
  for(let i=1;i<=steps;i++){
   const t=safe+(1-safe)*i/steps;
   if(!this.clear(point(t))){hit=t;break;}
   safe=t;
  }
  if(hit<1){
   let lower=safe,upper=hit;
   for(let i=0;i<9;i++){
    const mid=(lower+upper)*.5;
    if(this.clear(point(mid)))lower=mid;else upper=mid;
   }
   safe=lower;
  }
  return point(safe);
 }
}
