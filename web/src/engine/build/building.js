import * as THREE from 'three';
import {BuildGrid,CELL_METERS,LOG_HEIGHT,FLOOR_LOGS} from './build-grid.js';

const LOG_RADIUS=.14;
const PREFIX='build:';

// Camp construction on the bonfire's tangent plane: one log per cell wall, and a
// four-log floor for every cell whose ground course closes. The grid is the cell
// model from the game bible, so walls are shared and a room is built square by
// square. Every log and floor is a saved entity, so a camp returns as it was left.
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
 edgeBeam(key){
  const [kind,i,j,level]=key.split(':');
  const u=Number(i)*CELL_METERS,v=Number(j)*CELL_METERS,lift=Number(level)*LOG_HEIGHT+LOG_RADIUS;
  return kind==='h'
   ?this.beamBetween(this.pointAt(u,v,lift),this.pointAt(u+CELL_METERS,v,lift))
   :this.beamBetween(this.pointAt(u,v,lift),this.pointAt(u,v+CELL_METERS,lift));
 }
 // Four logs laid across the cell: the floor an enclosed cell earns.
 floorLog(i,j,k){
  const u=i*CELL_METERS,v=j*CELL_METERS+.5+k;
  return this.beamBetween(this.pointAt(u,v,LOG_RADIUS),this.pointAt(u+CELL_METERS,v,LOG_RADIUS));
 }
 render(){
  this.group.clear();
  if(!this.anchor)return;
  for(const key of this.grid.edges)this.group.add(this.edgeBeam(key));
  for(const cell of this.grid.floored){
   const [i,j]=cell.split(',').map(Number);
   for(let k=0;k<FLOOR_LOGS;k++)this.group.add(this.floorLog(i,j,k));
  }
 }
 restore(){
  if(!this.bonfire.exists||!this.anchorFromFire())return;
  for(const [id,state] of this.shared.entities){
   if(!id.startsWith(PREFIX)||state?.anchor!==this.anchorId)continue;
   if(state.kind==='beam')this.grid.restore(state.edge);
   else if(state.kind==='floor')this.grid.restoreFloor(state.i,state.j);
  }
  this.render();
 }
 // Long press with a burning fire toggles the build mode the hammer already opens.
 toggle(){
  if(this.mode){this.mode=false;this.group.visible=false;this.message?.('Build mode off');return false;}
  if(!this.bonfire.exists){this.message?.('Build a campfire first');return false;}
  this.anchorFromFire();
  this.mode=true;this.group.visible=true;
  this.message?.('Build mode: tap the ground to lay a log, hold to leave');
  return true;
 }
 // One tap spends the logs for the next wall of the cell under the finger, closing
 // it into a floor when that is the wall the cell was missing.
 tapAt(point){
  if(!this.mode||!this.anchor)return;
  const {i,j}=this.cellAt(point);
  const plan=this.grid.plan(i,j);
  if(!plan){this.message?.('This cell is as high as it goes');return;}
  if(!this.shared.spendLogs(this.playerId,plan.logs)){this.message?.('Not enough logs');return;}
  this.grid.build(i,j);
  this.shared.setEntity(PREFIX+'beam:'+plan.edge,{state:'standing',kind:'beam',anchor:this.anchorId,edge:plan.edge,ownerId:this.playerId});
  if(plan.floor)this.shared.setEntity(PREFIX+'floor:'+i+':'+j,{state:'standing',kind:'floor',anchor:this.anchorId,i,j,ownerId:this.playerId});
  this.render();
  this.message?.(plan.floor
   ?'Wall closed: four floor logs laid in cell '+i+','+j
   :'Log placed, course '+(plan.level+1)+' high in cell '+i+','+j);
 }
 targetCell(){
  const {north,east}=this.player.basis();
  const facing=north.multiplyScalar(Math.cos(this.player.heading)).addScaledVector(east,Math.sin(this.player.heading));
  return this.cellAt(this.player.position.clone().addScaledVector(facing,CELL_METERS*.6));
 }
 // A lit square in front of the player showing the cell and course the next tap
 // will build on, so the grid is never guessed at.
 update(){
  if(!this.mode||!this.anchor){if(this.ghost)this.ghost.visible=false;return;}
  const {i,j}=this.targetCell();
  const plan=this.grid.plan(i,j);
  if(!plan){if(this.ghost)this.ghost.visible=false;return;}
  const u=i*CELL_METERS,v=j*CELL_METERS,lift=plan.level*LOG_HEIGHT+LOG_RADIUS;
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
