// Camp building grid. A 4 m cell is floored by four logs laid in a square with a
// cross in the middle, framed by upright corner posts, and walled by stacking log
// courses between those posts up to four metres. The floor is the material itself,
// so it exists the moment the sixth log is down. Pure logic: no rendering or
// storage lives here.
export const CELL_METERS=4;
export const POST_HEIGHT=4;
export const LOG_HEIGHT=.5;
// The ground log is the bottom of the wall, so seven courses above it make the eight
// half-metre logs that reach the four metre post line.
export const COURSES=Math.round(POST_HEIGHT/LOG_HEIGHT)-1;
export const CROSS_LOGS=2;
// Three slots across a wall. An opening only ever grows: a window can become a door,
// a door can be paired into a double door, and nothing is ever filled back in.
export const WALL_SLOTS=3;
export const SOLID=0;
export const WINDOW=1;
export const DOOR=2;

const SIDES=['south','east','north','west'];

export class BuildGrid {
 constructor(){
  this.posts=new Set();
  this.ground=new Set();
  this.courses=new Map();
  this.cross=new Map();
  this.floored=new Set();
  this.openings=new Map();
  this.blown=new Set();
 }
 static post(i,j){return 'p:'+i+':'+j;}
 // A gap key names the two posts it spans, so the cells either side share the ground
 // log and the wall built on it.
 static gap(i,j,side){
  switch(side){
   case 'south':return 'w:h:'+i+':'+j;
   case 'north':return 'w:h:'+i+':'+(j+1);
   case 'west':return 'w:v:'+i+':'+j;
   default:return 'w:v:'+(i+1)+':'+j;
  }
 }
 static endsOf(key){
  const [kind,i,j]=key.split(':').slice(1);
  return kind==='h'?[[Number(i),Number(j)],[Number(i)+1,Number(j)]]
   :[[Number(i),Number(j)],[Number(i),Number(j)+1]];
 }
 // The cells a gap edges: laying a ground log there can finish either floor.
 static cellsOf(key){
  const [kind,i,j]=key.split(':').slice(1);
  return kind==='h'?[[Number(i),Number(j)-1],[Number(i),Number(j)]]
   :[[Number(i)-1,Number(j)],[Number(i),Number(j)]];
 }
 cornersOf(i,j){return [[i,j],[i+1,j],[i+1,j+1],[i,j+1]];}
 sidesOf(i,j){return SIDES.map(side=>({side,key:BuildGrid.gap(i,j,side)}));}
 cellKey(i,j){return i+','+j;}
 hasPost(i,j){return this.posts.has(BuildGrid.post(i,j));}
 framed(i,j){return this.cornersOf(i,j).every(([x,y])=>this.hasPost(x,y));}
 isFloored(i,j){return this.floored.has(this.cellKey(i,j));}
 groundLaid(key){return this.ground.has(key);}
 layGround(key){
  if(this.ground.has(key))return false;
  this.ground.add(key);
  return true;
 }
 crossLogs(i,j){return this.cross.get(this.cellKey(i,j))||0;}
 addCross(i,j){
  const key=this.cellKey(i,j),count=this.crossLogs(i,j);
  if(count>=CROSS_LOGS)return false;
  this.cross.set(key,count+1);
  return true;
 }
 // Four ground logs and the cross are the floor; nothing else is added on top.
 readyToFloor(i,j){
  return this.sidesOf(i,j).every(({key})=>this.ground.has(key))&&this.crossLogs(i,j)>=CROSS_LOGS;
 }
 refreshFloor(i,j){
  if(this.isFloored(i,j)||!this.readyToFloor(i,j))return false;
  this.floored.add(this.cellKey(i,j));
  return true;
 }
 coursesAt(key){return this.courses.get(key)||0;}
 // A course rests on the posts at both ends, so they have to stand first, and the
 // stack stops at the post height: one storey.
 wallsReady(key){return BuildGrid.endsOf(key).every(([x,y])=>this.hasPost(x,y));}
 addCourse(key){
  const count=this.coursesAt(key);
  if(count>=COURSES||!this.wallsReady(key))return false;
  this.courses.set(key,count+1);
  return true;
 }
 // What a tap in the middle of the cell asks for next: the ground square, then the
 // cross, then the posts. Courses are laid by tapping the gap itself.
 plan(i,j){
  const missing=this.sidesOf(i,j).find(({key})=>!this.groundLaid(key));
  if(missing)return {kind:'ground',key:missing.key,logs:1};
  if(this.crossLogs(i,j)<CROSS_LOGS)return {kind:'cross',i,j,logs:1};
  if(!this.framed(i,j)){
   const [x,y]=this.cornersOf(i,j).find(([cornerX,cornerY])=>!this.hasPost(cornerX,cornerY));
   return {kind:'post',i:x,j:y,logs:1};
  }
  return null;
 }
 // A wall with rooms on both sides is an inside wall, and it is the only one that
 // can be blown wide open.
 isInterior(key){return BuildGrid.cellsOf(key).every(([i,j])=>this.isFloored(i,j));}
 openingsAt(key){return this.openings.get(key)||new Array(WALL_SLOTS).fill(SOLID);}
 // Up to three windows, or one door and two windows, or a double door and one window.
 patternAllowed(slots){
  const doors=[],windows=slots.filter(state=>state===WINDOW).length;
  slots.forEach((state,index)=>{if(state===DOOR)doors.push(index);});
  if(doors.length===0)return windows<=WALL_SLOTS;
  if(doors.length===1)return windows<=2;
  if(doors.length===2)return doors[1]-doors[0]===1&&windows<=1;
  return false;
 }
 // Cutting is one way. A narrower opening than the one standing is always refused,
 // which is why a double door can only be cut out further.
 canCut(key,slot,to){
  if(slot<0||slot>=WALL_SLOTS||to<=SOLID||to>DOOR)return false;
  const slots=this.openingsAt(key);
  if(to<=slots[slot])return false;
  const next=slots.slice();
  next[slot]=to;
  return this.patternAllowed(next);
 }
 cut(key,slot,to){
  if(!this.canCut(key,slot,to))return false;
  const slots=this.openingsAt(key);
  slots[slot]=to;
  this.openings.set(key,slots);
  return true;
 }
 // Two doors side by side are one double door, and they stay that way.
 doubleDoor(key){
  const slots=this.openingsAt(key);
  for(let k=0;k<WALL_SLOTS-1;k++)if(slots[k]===DOOR&&slots[k+1]===DOOR)return k;
  return -1;
 }
 // An inside wall can be blown wide open, leaving the beam and the braces; after
 // that it is only more open, never less.
 blowOpen(key){
  if(!this.isInterior(key)||this.blown.has(key))return false;
  this.openings.set(key,new Array(WALL_SLOTS).fill(DOOR));
  this.blown.add(key);
  return true;
 }
 isBlown(key){return this.blown.has(key);}
 restoreOpenings(key,slots){this.openings.set(key,slots.slice());}
 restoreBlown(key){
  this.blown.add(key);
  this.openings.set(key,new Array(WALL_SLOTS).fill(DOOR));
 }
 // Taking whole material back out of a partial build. Only a log that is still whole
 // comes back; anything cut has already become an opening and stays open.
 removePost(i,j){return this.posts.delete(BuildGrid.post(i,j));}
 removeGround(key){return this.ground.delete(key);}
 takeCourse(key){
  const count=this.coursesAt(key);
  if(count<=0)return false;
  if(count===1)this.courses.delete(key);
  else this.courses.set(key,count-1);
  return true;
 }
 takeCross(i,j){
  const key=this.cellKey(i,j),count=this.crossLogs(i,j);
  if(count<=0)return false;
  if(count===1)this.cross.delete(key);
  else this.cross.set(key,count-1);
  return true;
 }
 // Taking material back can undo a finished floor.
 unfloor(i,j){
  if(!this.isFloored(i,j)||this.readyToFloor(i,j))return false;
  this.floored.delete(this.cellKey(i,j));
  return true;
 }
 restorePost(i,j){this.posts.add(BuildGrid.post(i,j));}
 restoreGround(key){this.ground.add(key);}
 restoreCross(i,j,count=CROSS_LOGS){this.cross.set(this.cellKey(i,j),count);}
 restoreCourse(key,count){this.courses.set(key,count);}
 restoreFloor(i,j){this.floored.add(this.cellKey(i,j));}
}
