// Persistent world-aligned terrain chunks. Refreshing a chunk only updates age;
// collider geometry and octree entries remain stable until safe retirement.
export class RollingTerrainCache {
 constructor(tree,{classify,depth=8,cellSize=16,maxRegions=48,lodDistances=[8,16,32,64,128,256]}) {
  this.tree=tree;this.classify=classify;this.depth=depth;
  this.cellSize=cellSize;this.maxRegions=maxRegions;this.lodDistances=lodDistances;this.regions=new Map();this.generation=0;this.pending=null;
 }
 get regionCount(){return this.regions.size;}
 key(x,y,z){return x+','+y+','+z;}
 refresh(player,budget=2,actors=[]){
  // Maintain compatibility with initial startup: schedule a limited amount of work.
  this.advance(player,actors,budget);
 }
 advance(player,actors=[],budgetMs=2){
  const s=this.cellSize,px=player.x??player[0],py=player.y??player[1],pz=player.z??player[2];
  const bodies=actors.length?actors:[{min:[px,py,pz],max:[px,py,pz]}];
  const cx=Math.floor(px/s),cy=Math.floor(py/s),cz=Math.floor(pz/s);
  const candidates=[];
  for(let x=cx-2;x<=cx+2;x++)for(let y=cy-2;y<=cy+2;y++)for(let z=cz-2;z<=cz+2;z++){
   const center=[(x+.5)*s,(y+.5)*s,(z+.5)*s];
   const distance=Math.hypot(...center.map((v,i)=>Math.max(0,Math.abs([px,py,pz][i]-v)-s/2)));
   if(distance>32)continue;
   const relevant=bodies.filter(b=>b.min.every((v,i)=>v<=center[i]+s/2+48&&b.max[i]>=center[i]-s/2-48));
   const signature=relevant.map(b=>b.min.map((v,i)=>Math.floor((v+b.max[i])/4)).join(':')).sort().join('|');
   candidates.push({key:this.key(x,y,z),center,distance,signature});
  }
  candidates.sort((a,b)=>a.distance-b.distance);
  const active=new Set(candidates.map(c=>c.key));
  const end=performance.now()+Math.max(0,budgetMs);
  let changed=false;
  for(const c of candidates){
   const current=this.regions.get(c.key);
   if(current?.signature===c.signature){
    this.regions.delete(c.key);this.regions.set(c.key,current);
    continue;
   }
   // Do not continue an obsolete build after the player changes its required LOD.
   if(this.pending&&(this.pending.key!==c.key||this.pending.signature!==c.signature)){
    if(!active.has(this.pending.key)||c.distance<this.pending.distance){
     this.pending=null;
    }
   }
   if(!this.pending){
    const generation=this.generation++;
    this.pending={...c,generation,boxes:[],iterator:this.classify(c.center,s/2,this.depth,bodies)};
   }
   if(this.pending.key!==c.key)continue;
   // Yield after each recursive leaf; never execute the entire classifier in one frame.
   do{
    const next=this.pending.iterator.next();
    if(next.done){
     const job=this.pending,ids=[];
     for(let i=0;i<job.boxes.length;i++){
      const id='ground:'+job.key+':'+job.generation+':'+i;
      this.tree.insert(id,job.boxes[i],{kind:'static',shape:'box',owner:'planet'});
      ids.push(id);
     }
     if(current)for(const id of current.ids)this.tree.remove(id);
     this.regions.delete(job.key);
     this.regions.set(job.key,{ids,signature:job.signature});
     this.pending=null;changed=true;break;
    }
    if(next.value)this.pending.boxes.push(next.value);
   }while(performance.now()<end);
   if(performance.now()>=end)break;
  }
  // Retire only out-of-range regions, oldest first.
  for(const [key,region] of this.regions){
   if(this.regions.size<=this.maxRegions)break;
   if(active.has(key))continue;
   for(const id of region.ids)this.tree.remove(id);
   this.regions.delete(key);changed=true;
  }
  return changed;
 }
}
