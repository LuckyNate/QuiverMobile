// Deterministic, bounded cache for static procedural collision patches.
// A chunk is a query/cache address, not a voxel or a change to solidity.
export class ChunkedSurface {
 constructor(surface,{chunkSize=32,maxChunks=128}={}){
  this.surface=surface;this.radius=surface.radius;
  this.chunkSize=chunkSize;this.maxChunks=maxChunks;this.cache=new Map();
 }
 key(x,y,z){return x+','+y+','+z;}
 query(bounds){
  const s=this.chunkSize,low=bounds.min.map(v=>Math.floor(v/s)),high=bounds.max.map(v=>Math.floor(v/s));
  const results=new Map();
  for(let x=low[0];x<=high[0];x++)for(let y=low[1];y<=high[1];y++)for(let z=low[2];z<=high[2];z++){
   const key=this.key(x,y,z);
   let entries=this.cache.get(key);
   if(!entries){
    const region={min:[x*s,y*s,z*s],max:[(x+1)*s,(y+1)*s,(z+1)*s]};
    entries=this.surface.query(region);
    this.cache.set(key,entries);
    if(this.cache.size>this.maxChunks)this.cache.delete(this.cache.keys().next().value);
   }else{
    // Refresh LRU order.
    this.cache.delete(key);this.cache.set(key,entries);
   }
   for(const entry of entries){
    // Ensure patch geometry actually overlaps the actor's query envelope.
    const pts=entry.points;
    if(!pts?.length)continue;
    let touches=true;
    for(let axis=0;axis<3;axis++){
     const min=Math.min(...pts.map(p=>p[axis])),max=Math.max(...pts.map(p=>p[axis]));
     if(max<bounds.min[axis]||min>bounds.max[axis]){touches=false;break;}
    }
    if(touches)results.set(entry.id,entry);
   }
  }
  return [...results.values()];
 }
}
