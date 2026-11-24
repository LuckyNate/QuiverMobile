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

const SIDES=['south','east','north','west'];

export class BuildGrid {
 constructor(){
  this.posts=new Set();
  this.ground=new Set();
  this.courses=new Map();
  this.cross=new Map();
  this.floored=new Set();
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
 restorePost(i,j){this.posts.add(BuildGrid.post(i,j));}
 restoreGround(key){this.ground.add(key);}
 restoreCross(i,j,count=CROSS_LOGS){this.cross.set(this.cellKey(i,j),count);}
 restoreCourse(key,count){this.courses.set(key,count);}
 restoreFloor(i,j){this.floored.add(this.cellKey(i,j));}
}
