import * as THREE from 'three';
import {BuildGrid,CELL_METERS,LOG_HEIGHT,FLOOR_LOGS} from './build-grid.js';

const LOG_RADIUS=.14;
const WALL_REACH=.8;
const PREFIX='build:';

// Camp construction on the bonfire's tangent plane: one log per cell wall, four
// floor logs for a cell with no wall missing, and one storey so a room is finished
// the moment its walls are up. Tapping a standing wall opens it into a doorway and
// the log returns to the hand; tapping it again closes it. Every wall and floor is
// a saved entity, so a camp returns as it was left.
export class Building {
 constructor({scene,shared,player,height,radius,bonfire,playerId,message}){
  Object.assign(this,{scene,shared,player,height,radius,bonfire,playerId,message});
  this.grid=new BuildGrid();
  this.group=new THREE.Group();
  this.group.visible=false;
  scene.add(this.group);
  this.wood=new THREE.MeshStandardMaterial({color:0x745039,roughness:1});
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
 // so a log sits on the surface instead of through it.
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
 beamBetween(from,to){
  const mesh=new THREE.Mesh(this.beamGeometry,this.wood);
  mesh.position.copy(from).add(to).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),to.clone().sub(from).normalize());
  return mesh;
 }
 wallSegment(i,j,side){
  const u=i*CELL_METERS,v=j*CELL_METERS,lift=LOG_HEIGHT/2;
  switch(side){
   case 'south':return [this.pointAt(u,v,lift),this.pointAt(u+CELL_METERS,v,lift)];
   case 'north':return [this.pointAt(u,v+CELL_METERS,lift),this.pointAt(u+CELL_METERS,v+CELL_METERS,lift)];
   case 'west':return [this.pointAt(u,v,lift),this.pointAt(u,v+CELL_METERS,lift)];
   default:return [this.pointAt(u+CELL_METERS,v,lift),this.pointAt(u+CELL_METERS,v+CELL_METERS,lift)];
  }
 }
 wallBeam(key){
  const [kind,i,j]=key.split(':');
  const [from,to]=this.wallSegmentForKind(kind,Number(i),Number(j));
  return this.beamBetween(from,to);
 }
 // The straight run a stored wall key spans, in camp coordinates.
 wallSegmentForKind(kind,i,j){
  const u=i*CELL_METERS,v=j*CELL_METERS,lift=LOG_HEIGHT/2;
  if(kind==='h')return [this.pointAt(u,v,lift),this.pointAt(u+CELL_METERS,v,lift)];
  return [this.pointAt(u,v,lift),this.pointAt(u,v+CELL_METERS,lift)];
 }
 // Four logs laid across the cell: the floor a finished room earns.
 floorLog(i,j,k){
  const u=i*CELL_METERS,v=j*CELL_METERS+.5+k;
  return this.beamBetween(this.pointAt(u,v,LOG_RADIUS),this.pointAt(u+CELL_METERS,v,LOG_RADIUS));
 }
 render(){
  this.group.clear();
  if(!this.anchor)return;
  for(const key of this.grid.edges)this.group.add(this.wallBeam(key));
  for(const cell of this.grid.floored){
   const [i,j]=cell.split(',').map(Number);
   for(let k=0;k<FLOOR_LOGS;k++)this.group.add(this.floorLog(i,j,k));
  }
 }
 restore(){
  if(!this.bonfire.exists||!this.anchorFromFire())return;
  for(const [id,state] of this.shared.entities){
   if(!id.startsWith(PREFIX)||state?.anchor!==this.anchorId)continue;
   if(state.kind==='wall'){
    if(state.state==='open')this.grid.restoreOpen(state.edge);
    else this.grid.restore(state.edge);
   }else if(state.kind==='floor')this.grid.restoreFloor(state.i,state.j);
  }
  this.render();
 }
 // Long press with a burning fire toggles build mode; the hammer opens it.
 toggle(){
  if(this.mode){this.mode=false;this.group.visible=false;this.message?.('Build mode off');return false;}
  if(!this.bonfire.exists){this.message?.('Build a campfire first');return false;}
  this.anchorFromFire();
  this.mode=true;this.group.visible=true;
  this.message?.('Build mode: tap a wall to raise it, tap it again to open a doorway');
  return true;
 }
 // The wall of this cell nearest the finger, if the finger is on one.
 wallNear(i,j,point){
  let best=null,bestDistance=WALL_REACH;
  for(const {side,key} of this.grid.sidesOf(i,j)){
   const [from,to]=this.wallSegment(i,j,side);
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
 // One tap: a missing wall is raised, a standing wall becomes a doorway, and a
 // doorway closes again. The closing log is the one that lays the floor.
 tapAt(point){
  if(!this.mode||!this.anchor)return;
  const {i,j}=this.cellAt(point);
  const wall=this.wallNear(i,j,point);
  if(wall&&this.grid.state(wall)!=='missing'){
   const next=this.grid.toggle(wall);
   if(next==='open'){
    this.shared.awardLog(this.playerId,1,1);
    this.message?.('Doorway opened, log returned');
   }else if(!this.shared.spendLogs(this.playerId,1)){
    this.grid.toggle(wall);
    this.message?.('Not enough logs');
    return;
   }else this.message?.('Wall closed');
   this.saveWall(wall,next);
   this.render();
   return;
  }
  const plan=this.grid.plan(i,j);
  if(!plan){this.message?.('This room is finished, and it is one storey');return;}
  if(!this.shared.spendLogs(this.playerId,plan.logs)){this.message?.('Not enough logs');return;}
  this.grid.build(i,j);
  this.saveWall(plan.edge,'built');
  if(plan.floor){
   this.saveFloor(i,j);
   this.message?.('Room closed: four floor logs laid');
  }else this.message?.('Log placed');
  this.render();
 }
 saveWall(key,state){
  this.shared.setEntity(PREFIX+'wall:'+key,{state,kind:'wall',anchor:this.anchorId,edge:key,ownerId:this.playerId});
 }
 saveFloor(i,j){
  this.shared.setEntity(PREFIX+'floor:'+i+':'+j,{state:'standing',kind:'floor',anchor:this.anchorId,i,j,ownerId:this.playerId});
 }
 targetCell(){
  const {north,east}=this.player.basis();
  const facing=north.multiplyScalar(Math.cos(this.player.heading)).addScaledVector(east,Math.sin(this.player.heading));
  return this.cellAt(this.player.position.clone().addScaledVector(facing,CELL_METERS*.6));
 }
 // A lit square in front of the player showing the cell the next tap will raise,
 // so the grid is never guessed at.
 update(){
  if(!this.mode||!this.anchor){if(this.ghost)this.ghost.visible=false;return;}
  const {i,j}=this.targetCell();
  const plan=this.grid.plan(i,j);
  if(!plan){if(this.ghost)this.ghost.visible=false;return;}
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
