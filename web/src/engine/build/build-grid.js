// Camp building grid: 4 m square cells on one tangent plane, each wall shared with
// the neighbour that also uses it. Walls are placed one log at a time, so a cell
// can stand partly built; when its ground course closes it takes four floor logs
// once, and the next log starts the course above. Pure logic: no rendering, input
// or storage lives here.
export const CELL_METERS=4;
export const LOG_HEIGHT=.28;
export const FLOOR_LOGS=4;

const SIDES=['south','east','north','west'];

export class BuildGrid {
 constructor(){
  this.edges=new Set();
  this.floored=new Set();
 }
 // One key per wall, shared by both cells either side of it. A wall built once is
 // never charged twice when the neighbour is started.
 static edge(i,j,side,level){
  switch(side){
   case 'south':return 'h:'+i+':'+j+':'+level;
   case 'north':return 'h:'+i+':'+(j+1)+':'+level;
   case 'west':return 'v:'+i+':'+j+':'+level;
   default:return 'v:'+(i+1)+':'+j+':'+level;
  }
 }
 edgesOf(i,j,level){return SIDES.map(side=>BuildGrid.edge(i,j,side,level));}
 enclosed(i,j,level){return this.edgesOf(i,j,level).every(key=>this.edges.has(key));}
 isFloored(i,j){return this.floored.has(i+','+j);}
 cellKey(i,j){return i+','+j;}
 // The next log for this cell: the first missing wall of its lowest unfinished
 // course. `closing` marks the log that completes the ground course, which is the
 // one that lays the floor, so the caller charges for both in one step.
 plan(i,j){
  for(let level=0;level<=64;level++){
   const missing=this.edgesOf(i,j,level).filter(key=>!this.edges.has(key));
   if(!missing.length)continue;
   const closing=missing.length===1;
   const floor=closing&&level===0&&!this.isFloored(i,j);
   return {level,edge:missing[0],closing,floor,logs:1+(floor?FLOOR_LOGS:0)};
  }
  return null;
 }
 build(i,j){
  const plan=this.plan(i,j);
  if(!plan)return null;
  this.edges.add(plan.edge);
  if(plan.floor)this.floored.add(this.cellKey(i,j));
  return plan;
 }
 restore(edgeKey){if(typeof edgeKey==='string')this.edges.add(edgeKey);}
 restoreFloor(i,j){this.floored.add(this.cellKey(i,j));}
}
