// Merge only face-adjacent axis-aligned solids whose union is a box.
// Sorting by the other two dimensions avoids quadratic pairwise scans.
export function mergeSolidBoxes(boxes){
 let items=boxes.map(b=>({min:[...b.min],max:[...b.max]}));
 let changed=true;
 while(changed){
  changed=false;
  for(let axis=0;axis<3;axis++){
   const other=[0,1,2].filter(i=>i!==axis),groups=new Map(),next=[];
   for(const b of items){
    const key=other.flatMap(i=>[b.min[i],b.max[i]]).join(',');
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(b);
   }
   for(const group of groups.values()){
    group.sort((a,b)=>a.min[axis]-b.min[axis]);
    let previous=null;
    for(const b of group){
     if(previous&&previous.max[axis]===b.min[axis]){
      previous.max[axis]=b.max[axis];changed=true;
     }else{previous=b;next.push(b);}
    }
   }
   items=next;
  }
 }
 return items;
}

// Persistent world-aligned terrain chunks. Refreshing a chunk only updates age;
// collider geometry and octree entries remain stable until safe retirement.
export class RollingTerrainCache {
 constructor(tree,{classify,depth=8,cellSize=16,maxRegions=48,lodDistances=[8,16,32,64,128,256]}) {
  this.tree=tree;this.classify=classify;this.depth=depth;
  this.cellSize=cellSize;this.maxRegions=maxRegions;this.lodDistances=lodDistances;this.regions=new Map();this.generation=0;this.pending=null;
 }
 get regionCount(){return this.regions.size;}
 // All chunks touching the spawn AABB (expanded by a small safety margin)
 // must be committed before physics can run.
 spawnCoverage(box,margin=2){
  const s=this.cellSize,min=box.min.map(v=>Math.floor((v-margin)/s)),max=box.max.map(v=>Math.floor((v+margin)/s));
  let ready=0,total=0;
  for(let x=min[0];x<=max[0];x++)for(let y=min[1];y<=max[1];y++)for(let z=min[2];z<=max[2];z++){
   total++;if(this.regions.has(this.key(x,y,z)))ready++;
  }
  return {ready,total,complete:ready===total};
 }
 key(x,y,z){return x+','+y+','+z;}
 refresh(player,budget=2,actors=[]){
  // Maintain compatibility with initial startup: schedule a limited amount of work.
  this.advance(player,actors,budget);
 }
 advance(player,actors=[],budgetMs=2,feet=null){
  const s=this.cellSize,px=player.x??player[0],py=player.y??player[1],pz=player.z??player[2];
  const feetPoint=feet??[px,py,pz];
  const bodies=actors.length?actors:[{min:[px,py,pz],max:[px,py,pz]}];
  const cx=Math.floor(px/s),cy=Math.floor(py/s),cz=Math.floor(pz/s);
  const candidates=[];
  for(let x=cx-2;x<=cx+2;x++)for(let y=cy-2;y<=cy+2;y++)for(let z=cz-2;z<=cz+2;z++){
   const center=[(x+.5)*s,(y+.5)*s,(z+.5)*s];
   const distance=Math.hypot(...center.map((v,i)=>Math.max(0,Math.abs(feetPoint[i]-v)-s/2)));
   if(distance>64)continue;
   const relevant=bodies.filter(b=>b.min.every((v,i)=>v<=center[i]+s/2+48&&b.max[i]>=center[i]-s/2-48));
   // A metre of feet movement changes the node-level LOD target, not every frame.
   const signature=feetPoint.map(v=>Math.floor(v)).join(':');
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
    const pendingDistance=candidates.find(v=>v.key===this.pending.key)?.distance??Infinity;
    if(this.pending.signature!==candidates.find(v=>v.key===this.pending.key)?.signature||c.distance<pendingDistance)this.pending=null;
   }
   if(!this.pending){
    const generation=this.generation++;
    this.pending={...c,generation,boxes:[],iterator:this.classify(c.center,s/2,this.depth,bodies,feetPoint)};
   }
   if(this.pending.key!==c.key)continue;
   // Yield after each recursive leaf; never execute the entire classifier in one frame.
   do{
    const next=this.pending.iterator.next();
    if(next.done){
     const job=this.pending,ids=[];
     const merged=mergeSolidBoxes(job.boxes);
     for(let i=0;i<merged.length;i++){
      const box=merged[i];
      // Permanent interior cells already occupy this volume. Never duplicate them.
      const covered=this.tree.query(box,{kinds:['static']}).some(entry=>entry.owner==='planet-interior'&&
       box.min.every((v,k)=>v>=entry.box.min[k]&&box.max[k]<=entry.box.max[k]));
      if(covered)continue;
      const id='ground:'+job.key+':'+job.generation+':'+i;
      this.tree.insert(id,box,{kind:'static',shape:'box',owner:'planet'});
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
  // Finished planetary occupancy is permanent. Distance never deletes ground.
  // FIFO is retained only for scheduling incomplete detail work.
  return changed;
 }
}
