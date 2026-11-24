// Camp building grid: corner posts on a 4 m lattice, logs spanning the gaps between
// them, and a four-log floor for every cell whose four posts stand. A gap left empty
// is a doorway or a window, so openings need no separate mode. One storey. Pure
// logic: no rendering, input or storage lives here.
export const CELL_METERS=4;
export const POST_HEIGHT=4;
export const LOG_HEIGHT=.28;
export const FLOOR_LOGS=4;

const SIDES=['south','east','north','west'];

export class BuildGrid {
 constructor(){
  this.posts=new Set();
  this.walls=new Set();
  this.floored=new Set();
 }
 static post(i,j){return 'p:'+i+':'+j;}
 // A gap key names the two posts it spans, so the cells either side share it and a
 // wall is never paid for twice.
 static wall(i,j,side){
  switch(side){
   case 'south':return 'w:h:'+i+':'+j;
   case 'north':return 'w:h:'+i+':'+(j+1);
   case 'west':return 'w:v:'+i+':'+j;
   default:return 'w:v:'+(i+1)+':'+j;
  }
 }
 cornersOf(i,j){return [[i,j],[i+1,j],[i+1,j+1],[i,j+1]];}
 sidesOf(i,j){return SIDES.map(side=>({side,key:BuildGrid.wall(i,j,side)}));}
 hasPost(i,j){return this.posts.has(BuildGrid.post(i,j));}
 // Four posts make the rectangle, and the floor follows from the frame rather than
 // from the walls, so a cell can be floored before it is walled.
 framed(i,j){return this.cornersOf(i,j).every(([x,y])=>this.hasPost(x,y));}
 cellKey(i,j){return i+','+j;}
 isFloored(i,j){return this.floored.has(this.cellKey(i,j));}
 wallBuilt(key){return this.walls.has(key);}
 // What a tap in the middle of this cell does next: the missing post, then the
 // floor, then nothing. Infill is never automatic, because an empty gap is wanted.
 plan(i,j){
  if(!this.framed(i,j)){
   const [x,y]=this.cornersOf(i,j).find(([cornerX,cornerY])=>!this.hasPost(cornerX,cornerY));
   return {kind:'post',i:x,j:y,logs:1};
  }
  if(!this.isFloored(i,j))return {kind:'floor',logs:FLOOR_LOGS};
  return null;
 }
 raisePost(i,j){
  if(this.hasPost(i,j))return false;
  this.posts.add(BuildGrid.post(i,j));
  return true;
 }
 layFloor(i,j){
  if(!this.framed(i,j)||this.isFloored(i,j))return false;
  this.floored.add(this.cellKey(i,j));
  return true;
 }
 raiseWall(key){
  if(this.walls.has(key))return false;
  this.walls.add(key);
  return true;
 }
 openWall(key){return this.walls.delete(key);}
 restorePost(i,j){this.posts.add(BuildGrid.post(i,j));}
 restoreWall(key){this.walls.add(key);}
 restoreFloor(i,j){this.floored.add(this.cellKey(i,j));}
}
