// Camp building grid: 4 m square cells on one tangent plane, each wall shared with
// the neighbour that also uses it. A cell is a single storey: four walls, and the
// four floor logs it earns when no wall is missing. Any wall can be left open as a
// doorway instead of solid, and the cell still counts as a room. Pure logic: no
// rendering, input or storage lives here.
export const CELL_METERS=4;
export const LOG_HEIGHT=.28;
export const FLOOR_LOGS=4;

const SIDES=['south','east','north','west'];

export class BuildGrid {
 constructor(){
  this.edges=new Set();
  this.open=new Set();
  this.floored=new Set();
 }
 // One key per wall, shared by both cells either side of it. A wall built once is
 // never charged twice when the neighbour is started.
 static edge(i,j,side,level=0){
  switch(side){
   case 'south':return 'h:'+i+':'+j+':'+level;
   case 'north':return 'h:'+i+':'+(j+1)+':'+level;
   case 'west':return 'v:'+i+':'+j+':'+level;
   default:return 'v:'+(i+1)+':'+j+':'+level;
  }
 }
 sidesOf(i,j){return SIDES.map(side=>({side,key:BuildGrid.edge(i,j,side)}));}
 state(key){
  if(this.open.has(key))return 'open';
  return this.edges.has(key)?'built':'missing';
 }
 // An open wall is settled, not absent: a shelter with a doorway is still a room.
 enclosed(i,j){return this.sidesOf(i,j).every(({key})=>this.state(key)!=='missing');}
 cellKey(i,j){return i+','+j;}
 isFloored(i,j){return this.floored.has(this.cellKey(i,j));}
 // The next wall of this cell, and the floor that arrives with the last one. A cell
 // with no wall missing is finished: building is one storey, so there is nothing
 // above it.
 plan(i,j){
  const missing=this.sidesOf(i,j).filter(({key})=>this.state(key)==='missing');
  if(!missing.length)return null;
  const closing=missing.length===1&&!this.isFloored(i,j);
  return {edge:missing[0].key,side:missing[0].side,closing,floor:closing,logs:1+(closing?FLOOR_LOGS:0)};
 }
 build(i,j){
  const plan=this.plan(i,j);
  if(!plan)return null;
  this.edges.add(plan.edge);
  if(plan.floor)this.floored.add(this.cellKey(i,j));
  return plan;
 }
 // A standing wall opens into a doorway and closes again with the same touch.
 toggle(key){
  const state=this.state(key);
  if(state==='built'){this.edges.delete(key);this.open.add(key);return 'open';}
  if(state==='open'){this.open.delete(key);this.edges.add(key);return 'built';}
  this.edges.add(key);
  return 'built';
 }
 restore(edgeKey){if(typeof edgeKey==='string')this.edges.add(edgeKey);}
 restoreOpen(edgeKey){if(typeof edgeKey==='string')this.open.add(edgeKey);}
 restoreFloor(i,j){this.floored.add(this.cellKey(i,j));}
}
