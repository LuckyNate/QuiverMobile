// Lightweight on-device profiler: accumulate per-frame costs, show a one-second average.
export class Profiler {
 constructor(target){
  this.target=target;
  this.totals={move:0,collision:0,physics:0,lod:0,render:0,frame:0};
  this.frames=0;
  this.last=performance.now();
 }
 mark(name,start){this.totals[name]+=performance.now()-start;}
 countFrame(){this.frames++;}
 update(){
  const now=performance.now();
  if(now-this.last<1000)return;
  const divisor=Math.max(1,this.frames);
  this.target.textContent='FPS '+this.frames
   +' | move '+(this.totals.move/divisor).toFixed(1)
   +' col '+(this.totals.collision/divisor).toFixed(1)
   +' phys '+(this.totals.physics/divisor).toFixed(1)
   +' LOD '+(this.totals.lod/divisor).toFixed(1)
   +' rnd '+(this.totals.render/divisor).toFixed(1)
   +' frame '+(this.totals.frame/divisor).toFixed(1)+' ms';
  for(const name in this.totals)this.totals[name]=0;
  this.frames=0;this.last=now;
 }
}
