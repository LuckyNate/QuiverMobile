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
   candidates.push({key:this.key(x,y,z),center,distance});
  }
  candidates.sort((a,b)=>a.distance-b.distance);
  // Finish a started classification even after its region leaves the nearby radius.
  if(this.pending)candidates.unshift(this.pending);
  const end=performance.now()+Math.max(0,budgetMs);
  let changed=false;
  for(const candidate of candidates){
   // A region's occupancy is computed exactly once, regardless of movement.
   if(this.regions.has(candidate.key))continue;
   if(!this.pending){
    this.pending={...candidate,boxes:[],
     iterator:this.classify(candidate.center,s/2,this.depth,[],null)};
   }
   // Never abandon a started region just because the player moves.
   if(this.pending.key!==candidate.key)continue;
   do{
    const next=this.pending.iterator.next();
    if(next.done){
     const job=this.pending,ids=[],merged=mergeSolidBoxes(job.boxes);
     for(let i=0;i<merged.length;i++){
      const box=merged[i];
      const covered=this.tree.query(box,{kinds:['static']}).some(entry=>entry.owner==='planet-interior'&&
       box.min.every((v,k)=>v>=entry.box.min[k]&&box.max[k]<=entry.box.max[k]));
      if(covered)continue;
      const id='ground:'+job.key+':'+i;
      this.tree.insert(id,box,{kind:'static',shape:'box',owner:'planet'});
      ids.push(id);
     }
     this.regions.set(job.key,{ids});
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
