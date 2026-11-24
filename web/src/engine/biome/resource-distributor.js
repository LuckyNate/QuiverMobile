// Deterministic resource candidates, independent of geometry tessellation.
// A caller supplies a terrain read-only sampler to accept/reject candidates.
export class ResourceDistributor {
 constructor(density){this.density=density;}
 candidates({biome,type,cellX,cellY,cellSize=32,origin,axisX,axisY,sampleSurface}){
  // A cell is a square in the grid, but the surface inside it is triangles, and a
  // triangle covers half its bounding rectangle. Populating the full square would
  // count every triangle's area twice, so the area used is half of it.
  const expected=this.density.expected(biome,type,cellSize*cellSize/2);
  const whole=Math.floor(expected),fraction=expected-whole;
  const total=whole+(this.density.sample(type,cellX,cellY,'count')<fraction?1:0);
  const results=[];
  for(let i=0;i<total;i++){
   const u=this.density.sample(type,cellX,cellY,'x:'+i);
   const v=this.density.sample(type,cellX,cellY,'y:'+i);
   const x=(cellX+u)*cellSize,y=(cellY+v)*cellSize;
   const at=sampleSurface(origin,axisX,axisY,x,y);
   if(at)results.push({id:biome+':'+type+':'+cellX+':'+cellY+':'+i,position:at});
  }
  return results;
 }
}
