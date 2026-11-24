import * as THREE from 'three';
import {BuildGrid,CELL_METERS,POST_HEIGHT,LOG_HEIGHT,FLOOR_LOGS} from './build-grid.js';

const LOG_RADIUS=.14;
const POST_REACH=.7;
const GAP_REACH=.5;
const PREFIX='build:';

// Camp construction on the bonfire's tangent plane: upright corner posts on a 4 m
// lattice, logs spanning the gaps between posts, and a four-log floor once a cell's
// four posts stand. A gap left empty is a doorway or a window, so nothing needs a
// mode of its own, and building is one storey. Every post, log and floor is a saved
// entity, so a camp returns as it was left.
export class Building {
 constructor({scene,shared,player,height,radius,bonfire,playerId,message}){
  Object.assign(this,{scene,shared,player,height,radius,bonfire,playerId,message});
  this.grid=new BuildGrid();
  this.group=new THREE.Group();
  this.group.visible=false;
  scene.add(this.group);
  this.wood=new THREE.MeshStandardMaterial({color:0x745039,roughness:1});
  this.postGeometry=new THREE.CylinderGeometry(LOG_RADIUS,LOG_RADIUS,POST_HEIGHT,6);
  this.beamGeometry=new THREE.CylinderGeometry(LOG_RADIUS,LOG_RADIUS,CELL_METERS,6);
  this.mode=false;
  this.anchor=null;
  this.anchorId='camp:bonfire:'+playerId;
  this.east=null;this.north=null;
  this.ghost=null;
  this.restore();
 }
 // The camp anchors building to the fire that permits it. Nothing here follows the
 // player around: a build site belongs to one camp.
 anchorFromFire(){
  if(!this.bonfire.exists)return false;
  this.anchor=this.bonfire.root.position.clone();
  const up=this.anchor.clone().normalize();
  const reference=Math.abs(up.y)<.9?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1);
  this.north=reference.clone().addScaledVector(up,-reference.dot(up)).normalize();
  this.east=new THREE.Vector3().crossVectors(up,this.north).normalize();
  return true;
 }
 // Grid coordinates are metres along the camp frame, wrapped back onto the sphere
 // so a post stands on the surface instead of through it.
 pointAt(u,v,lift=0){
  const point=this.anchor.clone().addScaledVector(this.east,u).addScaledVector(this.north,v);
  const direction=point.normalize();
  return direction.multiplyScalar(this.height.radius(direction,this.radius))
   .addScaledVector(this.anchor.clone().normalize(),lift);
 }
 cellAt(point){
  const relative=point.clone().sub(this.anchor);
  return {i:Math.floor(relative.dot(this.east)/CELL_METERS),j:Math.floor(relative.dot(this.north)/CELL_METERS)};
 }
 meshBetween(from,to,geometry=this.beamGeometry){
  const mesh=new THREE.Mesh(geometry,this.wood);
  mesh.position.copy(from).add(to).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),to.clone().sub(from).normalize());
  return mesh;
 }
 postMesh(i,j){
  const u=i*CELL_METERS,v=j*CELL_METERS;
  return this.meshBetween(this.pointAt(u,v,LOG_RADIUS/2),this.pointAt(u,v,POST_HEIGHT),this.postGeometry);
 }
 // A gap key names the posts it spans, so the log lies between two standing posts at
 // wall height whatever the cell it belongs to.
 wallGap(key){
  const [kind,i,j]=key.split(':').slice(1);
  const u=Number(i)*CELL_METERS,v=Number(j)*CELL_METERS,lift=POST_HEIGHT/2;
  return kind==='h'
   ?[this.pointAt(u,v,lift),this.pointAt(u+CELL_METERS,v,lift)]
   :[this.pointAt(u,v,lift),this.pointAt(u,v+CELL_METERS,lift)];
 }
 gapMesh(key){
  const [from,to]=this.wallGap(key);
  return this.meshBetween(from,to);
 }
 // Four logs laid across the cell: the floor a framed cell earns.
 floorLog(i,j,k){
  const u=i*CELL_METERS,v=j*CELL_METERS+.5+k;
  return this.meshBetween(this.pointAt(u,v,LOG_RADIUS),this.pointAt(u+CELL_METERS,v,LOG_RADIUS));
 }
 render(){
  this.group.clear();
  if(!this.anchor)return;
  for(const key of this.grid.posts){
   const [,i,j]=key.split(':').map(Number);
   this.group.add(this.postMesh(i,j));
  }
  for(const key of this.grid.walls)this.group.add(this.gapMesh(key));
  for(const cell of this.grid.floored){
   const [i,j]=cell.split(',').map(Number);
   for(let k=0;k<FLOOR_LOGS;k++)this.group.add(this.floorLog(i,j,k));
  }
 }
 restore(){
  if(!this.bonfire.exists||!this.anchorFromFire())return;
  for(const [id,state] of this.shared.entities){
   if(!id.startsWith(PREFIX)||state?.anchor!==this.anchorId)continue;
   if(state.kind==='post')this.grid.restorePost(state.i,state.j);
   else if(state.kind==='wall'&&state.state!=='open')this.grid.restoreWall(state.key);
   else if(state.kind==='floor')this.grid.restoreFloor(state.i,state.j);
  }
  this.render();
 }
 // Long press with a burning fire toggles build mode; the hammer opens it.
 toggle(){
  if(this.mode){this.mode=false;this.group.visible=false;this.message?.('Build mode off');return false;}
  if(!this.bonfire.exists){this.message?.('Build a campfire first');return false;}
  this.anchorFromFire();
  this.mode=true;this.group.visible=true;
  this.message?.('Build mode: tap a corner for a post, tap a gap to span it with a log');
  return true;
 }
 postNear(i,j,point){
  let best=null,bestDistance=POST_REACH;
  for(const [x,y] of this.grid.cornersOf(i,j)){
   const distance=point.distanceTo(this.pointAt(x*CELL_METERS,y*CELL_METERS,0));
   if(distance<bestDistance){bestDistance=distance;best={i:x,j:y};}
  }
  return best;
 }
 gapNear(i,j,point){
  let best=null,bestDistance=GAP_REACH;
  for(const {key} of this.grid.sidesOf(i,j)){
   const [from,to]=this.wallGap(key);
   const distance=this.distanceToSegment(point,from,to);
   if(distance<bestDistance){bestDistance=distance;best=key;}
  }
  return best;
 }
 distanceToSegment(point,from,to){
  const segment=to.clone().sub(from);
  const t=THREE.MathUtils.clamp(point.clone().sub(from).dot(segment)/Math.max(segment.lengthSq(),1e-6),0,1);
  return point.distanceTo(from.clone().addScaledVector(segment,t));
 }
 // One tap, one decision: a corner raises a post, a gap takes a log or gives it back,
 // and the middle of a frame lays the floor.
 tapAt(point){
  if(!this.mode||!this.anchor)return;
  const {i,j}=this.cellAt(point);
  const post=this.postNear(i,j,point);
  if(post){
   if(this.grid.hasPost(post.i,post.j)){this.message?.('That post already stands');return;}
   if(!this.shared.spendLogs(this.playerId,1)){this.message?.('Not enough logs');return;}
   this.grid.raisePost(post.i,post.j);
   this.savePost(post.i,post.j);
   this.message?.('Post placed');
   this.render();
   return;
  }
  const gap=this.gapNear(i,j,point);
  if(gap){
   if(this.grid.wallBuilt(gap)){
    this.grid.openWall(gap);
    this.shared.awardLog(this.playerId,1,1);
    this.saveWall(gap,'open');
    this.message?.('Gap opened, log returned');
   }else if(this.shared.spendLogs(this.playerId,1)){
    this.grid.raiseWall(gap);
    this.saveWall(gap,'standing');
    this.message?.('Log placed in the gap');
   }else{this.message?.('Not enough logs');return;}
   this.render();
   return;
  }
  const plan=this.grid.plan(i,j);
  if(!plan){this.message?.('This room is finished, and it is one storey');return;}
  if(!this.shared.spendLogs(this.playerId,plan.logs)){this.message?.('Not enough logs');return;}
  if(plan.kind==='post'){
   this.grid.raisePost(plan.i,plan.j);
   this.savePost(plan.i,plan.j);
   this.message?.('Post placed');
  }else{
   this.grid.layFloor(i,j);
   this.saveFloor(i,j);
   this.message?.('Frame complete: four floor logs laid');
  }
  this.render();
 }
 savePost(i,j){
  this.shared.setEntity(PREFIX+'post:'+i+':'+j,{state:'standing',kind:'post',anchor:this.anchorId,i,j,ownerId:this.playerId});
 }
 saveWall(key,state){
  this.shared.setEntity(PREFIX+'wall:'+key,{state,kind:'wall',anchor:this.anchorId,key,ownerId:this.playerId});
 }
 saveFloor(i,j){
  this.shared.setEntity(PREFIX+'floor:'+i+':'+j,{state:'standing',kind:'floor',anchor:this.anchorId,i,j,ownerId:this.playerId});
 }
 targetCell(){
  const {north,east}=this.player.basis();
  const facing=north.multiplyScalar(Math.cos(this.player.heading)).addScaledVector(east,Math.sin(this.player.heading));
  return this.cellAt(this.player.position.clone().addScaledVector(facing,CELL_METERS*.6));
 }
 // A lit square in front of the player showing the cell the next tap works in.
 update(){
  if(!this.mode||!this.anchor){if(this.ghost)this.ghost.visible=false;return;}
  const {i,j}=this.targetCell();
  const u=i*CELL_METERS,v=j*CELL_METERS,lift=LOG_HEIGHT/2;
  const corners=[this.pointAt(u,v,lift),this.pointAt(u+CELL_METERS,v,lift),
   this.pointAt(u+CELL_METERS,v+CELL_METERS,lift),this.pointAt(u,v+CELL_METERS,lift)];
  if(!this.ghost){
   const geometry=new THREE.BufferGeometry();
   geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(24),3));
   this.ghost=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0xffd27f}));
   this.ghost.frustumCulled=false;
   this.scene.add(this.ghost);
  }
  const position=this.ghost.geometry.attributes.position;
  for(let k=0;k<4;k++){
   const from=corners[k],to=corners[(k+1)%4];
   position.setXYZ(k*2,from.x,from.y,from.z);
   position.setXYZ(k*2+1,to.x,to.y,to.z);
  }
  position.needsUpdate=true;
  this.ghost.visible=true;
 }
}
