import * as THREE from 'three';

// A press shorter than this is still a tap; at or beyond it, the hammer holds.
const HOLD_MS=450;
// Two taps in nearly the same place, close together in time, take a placed log back
// out of a partial build instead of laying another.
const DOUBLE_TAP_MS=320;
const DOUBLE_TAP_PX=26;

// Tap resources or terrain to walk using the normal player physics path, and
// remember a spot to build a camp bonfire when the player arrives.
export class TapController {
 constructor({canvas,camera,height,radius,harvesting,sharedWorld,playerSystem,bonfire,building,message,isActive,setBonfireCandidate}){
  Object.assign(this,{canvas,camera,height,radius,harvesting,sharedWorld,playerSystem,bonfire,building,message,isActive,setBonfireCandidate});
  this.hammerPress=null;
  this.pendingTap=null;
  this.raycaster=new THREE.Raycaster();
  this.ndc=new THREE.Vector2();
  playerSystem.controls.onManualMove=()=>{
   setBonfireCandidate(null);
   playerSystem.cancelDestination();
   harvesting.ground.clearSelection();
  };
  playerSystem.controls.onTap=(screenX,screenY)=>this.tap(screenX,screenY);
  // Holding on an animal with the bow draws the string; letting go looses the
  // arrow. Out of range the press is not claimed, so nothing is drawn and
  // nothing is loosed. The hammer claims every press instead, so the release can
  // tell a short tap from a long hold; a claimed press never also becomes a tap.
  playerSystem.controls.onPress=(screenX,screenY)=>{
   if(this.isActive()&&sharedWorld.getEquippedTool('local-owner')==='hammer'){
    this.hammerPress={x:screenX,y:screenY,at:performance.now()};
    return true;
   }
   this.hammerPress=null;
   return this.press(screenX,screenY);
  };
  playerSystem.controls.onHoldEnd=(screenX,screenY,moved)=>{
   const press=this.hammerPress;
   this.hammerPress=null;
   if(!press)return this.harvesting.releaseBow();
   // A drag across the world is the camera being turned, not the hammer.
   if(moved)return;
   if(performance.now()-press.at>=HOLD_MS)return this.hold();
   this.tap(screenX??press.x,screenY??press.y);
  };
  playerSystem.controls.onHoldCancel=()=>{this.hammerPress=null;this.harvesting.cancelDraw();};
 }
 // What the finger is on: the nearest of the things a touch can mean, else null.
 pick(screenX,screenY){
  if(!this.isActive())return null;
  const {canvas,camera,harvesting}=this;
  const bounds=canvas.getBoundingClientRect();
  this.ndc.set((screenX-bounds.left)/bounds.width*2-1,1-(screenY-bounds.top)/bounds.height*2);
  this.raycaster.setFromCamera(this.ndc,camera);
  let picked=null,best=Infinity;
  // Trees, grass, boars, loose items, springs and the fire all answer to the same
  // touch: the nearest one to the finger is what the touch is aimed at.
  const consider=(position,type,id,visible)=>{
   if(!visible)return;
   const projected=position.clone().project(camera);
   if(projected.z<0||projected.z>1)return;
   const sx=(projected.x+1)*bounds.width*.5+bounds.left;
   const sy=(1-projected.y)*bounds.height*.5+bounds.top;
   const pixels=Math.hypot(screenX-sx,screenY-sy);
   if(pixels<Math.max(18,48/position.distanceTo(camera.position)*8)&&pixels<best){
    best=pixels;picked={at:position,id,type};
   }
  };
  for(const t of harvesting.trees)consider(t.at,'tree',t.id,t.state==='standing'&&t.tree.visible);
  for(const c of harvesting.creatures.creatures())consider(c.at,'boar',c.id,true);
  for(const c of harvesting.grass.clumps.values())consider(c.position,'grass',c.id,c.state==='standing'&&c.group.visible);
  for(const item of harvesting.ground.items.values())consider(item.position,'ground',item.id,item.state==='standing'&&item.group.visible);
  for(const pool of harvesting.springs.pools.values())consider(pool.position,'spring',pool.id,pool.state==='standing'&&pool.group.visible);
  // The camp fire is a target too, but only while it is burning: a cold pile of
  // logs is not a cook fire, so a tap on it just walks you there.
  if(harvesting.fire?.burning)consider(harvesting.fire.root.position,'fire','fire',true);
  return picked;
 }
 // A press claims the touch only when the bow can draw at that animal.
 press(screenX,screenY){
  const picked=this.pick(screenX,screenY);
  if(picked?.type!=='boar')return false;
  return this.harvesting.drawBow(picked.id)!==null;
 }
 tap(screenX,screenY){
  if(!this.isActive())return;
  // In build mode the ground itself is the target: a tap lays the next log in the
  // cell under the finger instead of walking or harvesting.
  if(this.building?.mode){
   const ground=this.groundAt(screenX,screenY);
   if(!ground)return;
   this.buildTap(ground,screenX,screenY);
   return;
  }
  this.flushBuildTap();
  const {height,radius,harvesting,sharedWorld,bonfire}=this;
  const picked=this.pick(screenX,screenY);
  const targetId=picked?.id??null,targetType=picked?.type??null;
  let destination=picked?.at??null;
  // Touch input does its work on the spot: the tap acts now, with what is in
  // hand, if the avatar is already close enough. Nothing here is remembered for
  // a later frame, walk or tool swap to set off. A tap out of reach just walks
  // the avatar toward it, and the next tap acts.
  if(targetType&&targetType!=='ground')harvesting.tapNow(targetType,targetId);
  harvesting.ground.select(targetType==='ground'?targetId:null);
  if(!destination){
   destination=this.groundAt(screenX,screenY);
   if(!destination)return;
  }
  if(!targetId&&sharedWorld.getEquippedTool('local-owner')==='hammer'&&!bonfire.exists&&
   (sharedWorld.getInventory('local-owner').logs||0)>=12){
   this.setBonfireCandidate(destination.clone());
  }else this.setBonfireCandidate(null);
  this.playerSystem.setDestination(destination);
 }
 // A build tap waits out the double-tap window before it acts, so the first tap of a
 // pair never lays a log that the second tap then has to take back. Only the second
 // tap of a pair acts at once, and it takes a log back instead of laying one.
 buildTap(ground,screenX,screenY){
  const pending=this.pendingTap,now=performance.now();
  const paired=Boolean(pending)&&now-pending.at<=DOUBLE_TAP_MS&&
   Math.hypot(screenX-pending.x,screenY-pending.y)<=DOUBLE_TAP_PX;
  if(pending){
   clearTimeout(pending.timer);
   this.pendingTap=null;
   if(paired){this.building.recoverAt(pending.ground);return;}
   // A tap somewhere else is its own action, so the waiting one lands first.
   this.building.tapAt(pending.ground);
  }
  this.pendingTap={x:screenX,y:screenY,at:now,ground,
   timer:setTimeout(()=>this.flushBuildTap(),DOUBLE_TAP_MS)};
 }
 // The waiting tap lands now, once it is clear no second tap is coming.
 flushBuildTap(){
  const pending=this.pendingTap;
  if(!pending)return;
  clearTimeout(pending.timer);
  this.pendingTap=null;
  this.building?.tapAt(pending.ground);
 }
 // The terrain point under a touch: intersect a conservative shell, then refine
 // against the analytic surface until the ray meets the ground.
 groundAt(screenX,screenY){
  const bounds=this.canvas.getBoundingClientRect();
  this.ndc.set((screenX-bounds.left)/bounds.width*2-1,1-(screenY-bounds.top)/bounds.height*2);
  this.raycaster.setFromCamera(this.ndc,this.camera);
  const ray=this.raycaster.ray;
  const sphere=new THREE.Sphere(new THREE.Vector3(),this.radius);
  const hit=ray.intersectSphere(sphere,new THREE.Vector3());
  if(!hit)return null;
  let travel=hit.distanceTo(ray.origin);
  for(let i=0;i<7;i++){
   const point=ray.at(travel,new THREE.Vector3());
   const up=point.clone().normalize(),surfaceRadius=this.height.radius(up,this.radius);
   const error=point.length()-surfaceRadius;
   const slope=ray.direction.dot(up);
   if(Math.abs(slope)<.08)break;
   travel-=error/slope;
   if(travel<0)return null;
  }
  const point=ray.at(travel,new THREE.Vector3());
  if(Math.abs(point.length()-this.height.radius(point.clone().normalize(),this.radius))>3)return null;
  return point;
 }
 // Long press with the hammer: a campfire is planted where the player stands, on
 // the analytic surface rather than at the capsule centre. Once a fire exists the
 // same press opens the build menu.
 hold(){
  const {bonfire,sharedWorld,playerSystem,height,radius}=this;
  if(bonfire.exists){
   this.flushBuildTap();
   return this.building?.toggle();
  }
  const direction=playerSystem.position.clone().normalize();
  const ground=direction.clone().multiplyScalar(height.radius(direction,radius)+.02);
  if(bonfire.build(ground))return;
  this.message?.((sharedWorld.getInventory('local-owner').logs||0)<12
   ?'A campfire needs 12 logs':'Campfire cannot be placed here');
 }
}
