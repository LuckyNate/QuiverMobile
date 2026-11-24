import * as THREE from 'three';

// Tap resources or terrain to walk using the normal player physics path, and
// remember a spot to build a camp bonfire when the player arrives.
export class TapController {
 constructor({canvas,camera,height,radius,harvesting,sharedWorld,playerSystem,bonfire,isActive,setBonfireCandidate}){
  Object.assign(this,{canvas,camera,height,radius,harvesting,sharedWorld,playerSystem,bonfire,isActive,setBonfireCandidate});
  this.raycaster=new THREE.Raycaster();
  this.ndc=new THREE.Vector2();
  playerSystem.controls.onManualMove=()=>{
   setBonfireCandidate(null);
   playerSystem.cancelDestination();
   harvesting.ground.clearSelection();
   harvesting.clearTapGather();
  };
  playerSystem.controls.onTap=(screenX,screenY)=>this.tap(screenX,screenY);
 }
 tap(screenX,screenY){
  if(!this.isActive())return;
  const {canvas,camera,height,radius,harvesting,sharedWorld,bonfire}=this;
  const bounds=canvas.getBoundingClientRect();
  this.ndc.set((screenX-bounds.left)/bounds.width*2-1,1-(screenY-bounds.top)/bounds.height*2);
  this.raycaster.setFromCamera(this.ndc,camera);
  let destination=null,best=Infinity,targetId=null,targetType=null;
  // Trees, grass, sticks and stones all answer to the same tap: the nearest one
  // to the finger becomes the target, and gathering happens on arrival.
  const consider=(position,type,id,visible)=>{
   if(!visible)return;
   const projected=position.clone().project(camera);
   if(projected.z<0||projected.z>1)return;
   const sx=(projected.x+1)*bounds.width*.5+bounds.left;
   const sy=(1-projected.y)*bounds.height*.5+bounds.top;
   const pixels=Math.hypot(screenX-sx,screenY-sy);
   if(pixels<Math.max(18,48/position.distanceTo(camera.position)*8)&&pixels<best){
    best=pixels;destination=position;targetId=id;targetType=type;
   }
  };
  for(const t of harvesting.trees)consider(t.at,'tree',t.id,t.state==='standing'&&t.tree.visible);
  // Boars are tap targets too, dead ones included: a carcass still answers a knife.
  for(const c of harvesting.creatures.creatures())consider(c.at,'boar',c.id,true);
  for(const c of harvesting.grass.clumps.values())consider(c.position,'grass',c.id,c.state==='standing'&&c.group.visible);
  for(const item of harvesting.ground.items.values())consider(item.position,'ground',item.id,item.state==='standing'&&item.group.visible);
  harvesting.ground.select(targetType==='ground'?targetId:null);
  harvesting.tapGather(targetType==='ground'?null:targetType,targetId);
  if(!destination){
   // Intersect a conservative shell, then iteratively refine to true terrain height.
   const ray=this.raycaster.ray;
   const sphere=new THREE.Sphere(new THREE.Vector3(),radius);
   const hit=ray.intersectSphere(sphere,new THREE.Vector3());
   if(!hit)return;
   let travel=hit.distanceTo(ray.origin);
   for(let i=0;i<7;i++){
    const point=ray.at(travel,new THREE.Vector3());
    const up=point.clone().normalize(),surfaceRadius=height.radius(up,radius);
    const error=point.length()-surfaceRadius;
    const slope=ray.direction.dot(up);
    if(Math.abs(slope)<.08)break;
    travel-=error/slope;
    if(travel<0)return;
   }
   const point=ray.at(travel,new THREE.Vector3());
   if(Math.abs(point.length()-height.radius(point.clone().normalize(),radius))>3)return;
   destination=point;
  }
  if(!targetId&&sharedWorld.getEquippedTool('local-owner')==='hammer'&&!bonfire.exists&&
     (sharedWorld.getInventory('local-owner').logs||0)>=12){
   this.setBonfireCandidate(destination.clone());
  }else this.setBonfireCandidate(null);
  this.playerSystem.setDestination(destination);
 }
}
