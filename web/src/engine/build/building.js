import * as THREE from 'three';
import {BuildGrid,CELL_METERS,POST_HEIGHT,LOG_HEIGHT,COURSES,CROSS_LOGS,WALL_SLOTS,SOLID,WINDOW,DOOR} from './build-grid.js';

const LOG_RADIUS=LOG_HEIGHT/2;
const POST_REACH=.7;
const GAP_REACH=.5;
const TOP_REACH=.55;
const DEREZZ_MS=260;
const PREFIX='build:';

// Camp construction on the bonfire's tangent plane. A cell is floored by four logs
// laid in a square with a cross in the middle, its corners take upright posts, and
// the walls are log courses stacked between those posts up to four metres. One
// storey. Removed pieces derezz: construction leaves no trash. Every log and post is
// a saved entity, so a camp returns as it was left.
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
  // The flooring that fills a finished cell, laid on top of its log frame.
  this.deckGeometry=new THREE.BoxGeometry(CELL_METERS-LOG_HEIGHT,.08,CELL_METERS-LOG_HEIGHT);
  this.mode=false;
  this.anchor=null;
  this.anchorId='camp:bonfire:'+playerId;
  this.east=null;this.north=null;
  this.ghost=null;
  this.fade=[];
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
 // Grid coordinates are metres along the camp frame, wrapped back onto the sphere so
 // a post stands on the surface instead of through it.
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
 // The ground log and every course above it lie between the same two posts, so one
 // gap carries the whole wall.
 gapSpan(key,lift){
  const [kind,i,j]=key.split(':').slice(1);
  const u=Number(i)*CELL_METERS,v=Number(j)*CELL_METERS;
  return kind==='h'
   ?[this.pointAt(u,v,lift),this.pointAt(u+CELL_METERS,v,lift)]
   :[this.pointAt(u,v,lift),this.pointAt(u,v+CELL_METERS,lift)];
 }
 // A third of the wall over a gap between two posts, short enough that an opening can
 // leave the rest of the wall standing.
 gapPiece(key,lift,t0,t1){
  const [from,to]=this.gapSpan(key,lift);
  const start=from.clone().lerp(to,t0),end=from.clone().lerp(to,t1);
  const piece=this.meshBetween(start,end);
  piece.scale.y=start.distanceTo(end)/CELL_METERS;
  return piece;
 }
 // A window sits above the sill, a door runs down to the floor, and a blown wall keeps
 // only the beam across the top.
 hidden(k,state){
  if(state===WINDOW)return k>=2&&k<=3;
  if(state===DOOR)return k<=2;
  return false;
 }
 wallPieces(key){
  const courses=this.grid.coursesAt(key),slots=this.grid.openingsAt(key),blown=this.grid.isBlown(key);
  const pieces=[];
  for(let k=0;k<courses;k++){
   const lift=LOG_HEIGHT*(k+1.5);
   for(let slot=0;slot<WALL_SLOTS;slot++){
    if(blown?k<COURSES-1:this.hidden(k,slots[slot]))continue;
    pieces.push(this.gapPiece(key,lift,slot/WALL_SLOTS,(slot+1)/WALL_SLOTS));
   }
  }
  return pieces;
 }
 groundPieces(key){
  const slots=this.grid.openingsAt(key),blown=this.grid.isBlown(key);
  const pieces=[];
  for(let slot=0;slot<WALL_SLOTS;slot++){
   if(blown||slots[slot]===DOOR)continue;
   pieces.push(this.gapPiece(key,LOG_HEIGHT/2,slot/WALL_SLOTS,(slot+1)/WALL_SLOTS));
  }
  return pieces;
 }
 // The cross lies between the ground ring rather than through it, and the second log
 // rests on the first, so the frame stacks instead of intersecting.
 crossMesh(i,j,index){
  const u=i*CELL_METERS,v=j*CELL_METERS,mid=CELL_METERS/2,inset=LOG_RADIUS;
  const lift=index===0?LOG_HEIGHT/2:LOG_HEIGHT*1.5;
  return index===0
   ?this.meshBetween(this.pointAt(u+inset,v+mid,lift),this.pointAt(u+CELL_METERS-inset,v+mid,lift))
   :this.meshBetween(this.pointAt(u+mid,v+inset,lift),this.pointAt(u+mid,v+CELL_METERS-inset,lift));
 }
 // The deck that fills a floored cell, sitting on the completed frame.
 floorDeck(i,j){
  const up=this.anchor.clone().normalize();
  const mesh=new THREE.Mesh(this.deckGeometry,this.wood);
  mesh.position.copy(this.pointAt(i*CELL_METERS+CELL_METERS/2,j*CELL_METERS+CELL_METERS/2,LOG_HEIGHT*2+.05));
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(this.east,up,this.north));
  return mesh;
 }
 render(){
  this.group.clear();
  if(!this.anchor)return;
  for(const key of this.grid.posts){
   const [,i,j]=key.split(':').map(Number);
   this.group.add(this.postMesh(i,j));
  }
  for(const key of this.grid.ground)this.group.add(...this.groundPieces(key));
  for(const [cell,count] of this.grid.cross){
   const [i,j]=cell.split(',').map(Number);
   for(let k=0;k<count;k++)this.group.add(this.crossMesh(i,j,k));
  }
  for(const cell of this.grid.floored){
   const [i,j]=cell.split(',').map(Number);
   this.group.add(this.floorDeck(i,j));
  }
  for(const key of this.grid.courses.keys())this.group.add(...this.wallPieces(key));
 }
 restore(){
  if(!this.bonfire.exists||!this.anchorFromFire())return;
  for(const [id,state] of this.shared.entities){
   if(!id.startsWith(PREFIX)||state?.anchor!==this.anchorId)continue;
   if(state?.state==='recovered')continue;
   if(state.kind==='post')this.grid.restorePost(state.i,state.j);
   else if(state.kind==='ground'&&state.state!=='open')this.grid.restoreGround(state.key);
   else if(state.kind==='cross')this.grid.restoreCross(state.i,state.j,state.count);
   else if(state.kind==='course')this.grid.restoreCourse(state.key,Math.min(state.count??0,COURSES));
   else if(state.kind==='openings'){
    if(state.blown)this.grid.restoreBlown(state.key);
    else this.grid.restoreOpenings(state.key,state.slots);
   }
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
  this.message?.('Build mode: lay the floor square, stand the posts, then stack the walls');
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
 // A course goes on top of the stack, so the top log is what a tap has to land on.
 // With nothing stacked yet the ground log is the top.
 stackLift(key){
  const courses=this.grid.coursesAt(key);
  return courses>0?LOG_HEIGHT*(courses+.5):LOG_HEIGHT/2;
 }
 onTopLog(key,point){
  return this.distanceToSegment(point,...this.gapSpan(key,this.stackLift(key)))<=TOP_REACH;
 }
 gapNear(i,j,point){
  let best=null,bestDistance=GAP_REACH;
  for(const {key} of this.grid.sidesOf(i,j)){
   const distance=this.distanceToSegment(point,...this.gapSpan(key,0));
   if(distance<bestDistance){bestDistance=distance;best=key;}
  }
  return best;
 }
 distanceToSegment(point,from,to){
  const segment=to.clone().sub(from);
  const t=THREE.MathUtils.clamp(point.clone().sub(from).dot(segment)/Math.max(segment.lengthSq(),1e-6),0,1);
  return point.distanceTo(from.clone().addScaledVector(segment,t));
 }
 spend(count){
  if(this.shared.spendLogs(this.playerId,count))return true;
  this.message?.('Not enough logs');
  return false;
 }
 // A ground log may finish the floor of either cell it edges.
 settleFloor(cells){
  for(const [i,j] of cells){
   if(!this.grid.refreshFloor(i,j))continue;
   this.shared.setEntity(PREFIX+'floor:'+i+':'+j,{state:'standing',kind:'floor',anchor:this.anchorId,i,j,ownerId:this.playerId});
   this.message?.('Floor finished: the square and the cross are down');
   return true;
  }
  return false;
 }
 // One tap, one decision: a corner takes a post, a gap takes the ground log and then
 // the courses above it, and the middle of the cell lays the square and the cross.
 tapAt(point){
  if(!this.mode||!this.anchor)return;
  const {i,j}=this.cellAt(point);
  const post=this.postNear(i,j,point);
  if(post){
   if(this.grid.hasPost(post.i,post.j)){this.message?.('That post already stands');return;}
   if(!this.spend(1))return;
   this.grid.restorePost(post.i,post.j);
   this.shared.setEntity(PREFIX+'post:'+post.i+':'+post.j,{state:'standing',kind:'post',anchor:this.anchorId,i:post.i,j:post.j,ownerId:this.playerId});
   this.message?.('Post placed');
   this.render();
   return;
  }
  const gap=this.gapNear(i,j,point);
  if(gap){
   if(!this.grid.groundLaid(gap)){
    if(!this.spend(1))return;
    this.grid.layGround(gap);
    this.shared.setEntity(PREFIX+'ground:'+gap,{state:'standing',kind:'ground',anchor:this.anchorId,key:gap,ownerId:this.playerId});
    if(!this.settleFloor(BuildGrid.cellsOf(gap)))this.message?.('Ground log laid');
    this.render();
    return;
   }
   if(!this.grid.wallsReady(gap)){this.message?.('Stand a post at both ends first');return;}
   if(this.grid.coursesAt(gap)>=COURSES){this.cutAt(gap,point);return;}
   if(!this.onTopLog(gap,point)){this.message?.('Lay a course by tapping the top log');return;}
   if(!this.spend(1))return;
   this.grid.addCourse(gap);
   this.shared.setEntity(PREFIX+'course:'+gap,{state:'standing',kind:'course',anchor:this.anchorId,key:gap,count:this.grid.coursesAt(gap),ownerId:this.playerId});
   this.message?.('Course laid, '+this.grid.coursesAt(gap)+' of '+COURSES);
   this.render();
   return;
  }
  const plan=this.grid.plan(i,j);
  if(!plan){this.message?.('This cell is floored and framed');return;}
  if(!this.spend(plan.logs))return;
  if(plan.kind==='ground'){
   this.grid.layGround(plan.key);
   this.shared.setEntity(PREFIX+'ground:'+plan.key,{state:'standing',kind:'ground',anchor:this.anchorId,key:plan.key,ownerId:this.playerId});
   if(!this.settleFloor(BuildGrid.cellsOf(plan.key)))this.message?.('Ground log laid');
  }else if(plan.kind==='cross'){
   this.grid.addCross(i,j);
   this.shared.setEntity(PREFIX+'cross:'+i+':'+j,{state:'standing',kind:'cross',anchor:this.anchorId,i,j,count:this.grid.crossLogs(i,j),ownerId:this.playerId});
   if(!this.settleFloor([[i,j]]))this.message?.('Cross log laid');
  }else{
   this.grid.restorePost(plan.i,plan.j);
   this.shared.setEntity(PREFIX+'post:'+plan.i+':'+plan.j,{state:'standing',kind:'post',anchor:this.anchorId,i:plan.i,j:plan.j,ownerId:this.playerId});
   this.message?.('Post placed');
  }
  this.render();
 }
 // With the hammer's hatchet, a finished wall is cut where it is struck: a window,
 // then a door in that same slot, then a second door beside it. A wall between two
 // rooms that is all doors can be blown wide open instead.
 cutAt(key,point){
  // The build hammer is the hatchet: cutting never asks for a different tool.
  if(this.shared.getEquippedTool(this.playerId)!=='hammer'){this.message?.('Hold the build hammer to cut this wall');return;}
  const slots=this.grid.openingsAt(key);
  if(slots.every(state=>state===DOOR)&&this.grid.isInterior(key)){this.blowAt(key);return;}
  const slot=this.slotAt(key,point),state=slots[slot];
  if(state===DOOR){this.message?.('That is a door already, and openings only get wider');return;}
  const to=state===WINDOW?DOOR:WINDOW;
  if(!this.grid.cut(key,slot,to)){this.message?.('This wall cannot take that opening');return;}
  this.derezzSlot(key,slot,state,to);
  this.saveOpenings(key);
  this.message?.(to===WINDOW?'Window cut':'Window widened into a door');
  this.render();
 }
 slotAt(key,point){
  const [from,to]=this.gapSpan(key,0);
  const along=to.clone().sub(from);
  const t=THREE.MathUtils.clamp(point.clone().sub(from).dot(along)/Math.max(along.lengthSq(),1e-6),0,.999);
  return Math.floor(t*WALL_SLOTS);
 }
 // The timber the new opening swallows derezzes where it stood.
 derezzSlot(key,slot,from,to){
  for(let k=0;k<COURSES;k++){
   if(!this.hidden(k,to)||this.hidden(k,from))continue;
   this.derezz(this.gapPiece(key,LOG_HEIGHT*(k+1.5),slot/WALL_SLOTS,(slot+1)/WALL_SLOTS));
  }
 }
 blowAt(key){
  if(!this.grid.blowOpen(key)){this.message?.('Only a wall between two rooms can be blown open');return;}
  for(let slot=0;slot<WALL_SLOTS;slot++)this.derezzSlot(key,slot,0,DOOR);
  this.saveOpenings(key);
  this.message?.('Blown wide open, beam and braces left standing');
  this.render();
 }
 // Double tap takes one whole log back out of a partial build. Timber that has been
 // cut is not a log any more, so it only derezzes and never comes back.
 recoverAt(point){
  if(!this.mode||!this.anchor)return;
  const {i,j}=this.cellAt(point);
  const post=this.postNear(i,j,point);
  if(post&&this.grid.hasPost(post.i,post.j))return this.recoverPost(post.i,post.j);
  const gap=this.gapNear(i,j,point);
  if(gap&&this.grid.groundLaid(gap))return this.recoverGap(gap);
  this.recoverCross(i,j);
 }
 loadedAt(i,j){
  for(const [key,count] of this.grid.courses){
   if(count<=0)continue;
   if(BuildGrid.endsOf(key).some(([x,y])=>x===i&&y===j))return true;
  }
  return false;
 }
 recoverPost(i,j){
  if(this.loadedAt(i,j)){this.message?.('A wall is stacked on that post');return;}
  this.grid.removePost(i,j);
  this.shared.setEntity(PREFIX+'post:'+i+':'+j,{state:'recovered',kind:'post',anchor:this.anchorId,i,j,ownerId:this.playerId});
  this.shared.awardLog(this.playerId,1,1);
  this.message?.('Post taken back');
  this.render();
 }
 // A gap holds its ground log and the courses above it, so the top course comes back
 // first. A gap that has been cut holds no whole logs at all.
 recoverGap(gap){
  if(this.grid.isBlown(gap)||this.grid.openingsAt(gap).some(state=>state!==SOLID)){
   this.message?.('Cut timber only derezzes');
   return;
  }
  if(this.grid.takeCourse(gap)){
   this.shared.awardLog(this.playerId,1,1);
   this.saveCourse(gap);
   this.message?.('Log taken back');
   this.render();
   return;
  }
  this.grid.removeGround(gap);
  this.shared.setEntity(PREFIX+'ground:'+gap,{state:'recovered',kind:'ground',anchor:this.anchorId,key:gap,ownerId:this.playerId});
  this.settleUnfloor(BuildGrid.cellsOf(gap));
  this.shared.awardLog(this.playerId,1,1);
  this.message?.('Ground log taken back');
  this.render();
 }
 recoverCross(i,j){
  if(!this.grid.takeCross(i,j)){this.message?.('Nothing to take back here');return;}
  this.shared.awardLog(this.playerId,1,1);
  this.shared.setEntity(PREFIX+'cross:'+i+':'+j,{state:'standing',kind:'cross',anchor:this.anchorId,i,j,count:this.grid.crossLogs(i,j),ownerId:this.playerId});
  this.settleUnfloor([[i,j]]);
  this.message?.('Cross log taken back');
  this.render();
 }
 // A floor whose material has been taken back is no longer a floor.
 settleUnfloor(cells){
  for(const [i,j] of cells){
   if(!this.grid.unfloor(i,j))continue;
   this.shared.setEntity(PREFIX+'floor:'+i+':'+j,{state:'recovered',kind:'floor',anchor:this.anchorId,i,j,ownerId:this.playerId});
  }
 }
 saveCourse(gap){
  const count=this.grid.coursesAt(gap);
  this.shared.setEntity(PREFIX+'course:'+gap,{state:count>0?'standing':'recovered',kind:'course',anchor:this.anchorId,key:gap,count,ownerId:this.playerId});
 }
 saveOpenings(key){
  this.shared.setEntity(PREFIX+'openings:'+key,{state:'cut',kind:'openings',anchor:this.anchorId,key,slots:this.grid.openingsAt(key).slice(),blown:this.grid.isBlown(key),ownerId:this.playerId});
 }
 targetCell(){
  const {north,east}=this.player.basis();
  const facing=north.multiplyScalar(Math.cos(this.player.heading)).addScaledVector(east,Math.sin(this.player.heading));
  return this.cellAt(this.player.position.clone().addScaledVector(facing,CELL_METERS*.6));
 }
 // The piece shrinks away where it stood. Nothing is left behind to pick up.
 derezz(mesh){
  const ghost=mesh.clone();
  ghost.material=this.wood.clone();
  ghost.material.transparent=true;
  this.scene.add(ghost);
  this.fade.push({ghost,start:performance.now()});
 }
 stepDerez(){
  if(!this.fade.length)return;
  const now=performance.now();
  this.fade=this.fade.filter(item=>{
   const t=Math.min(1,(now-item.start)/DEREZZ_MS);
   item.ghost.scale.setScalar(Math.max(.001,1-t));
   item.ghost.material.opacity=1-t;
   if(t<1)return true;
   this.scene.remove(item.ghost);
   item.ghost.material.dispose();
   return false;
  });
 }
 // A lit square in front of the player showing the cell the next tap works in.
 update(){
  this.stepDerez();
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
