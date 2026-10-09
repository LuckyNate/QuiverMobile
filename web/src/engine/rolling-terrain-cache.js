// Persistent world-aligned terrain chunks. Refreshing a chunk only updates age;
// collider geometry and octree entries remain stable until safe retirement.
export class RollingTerrainCache {
 constructor(tree,{classify,depth=8,cellSize=16,maxRegions=48,lodDistances=[8,16,32,64,128,256]}) {
  this.tree=tree;this.classify=classify;this.depth=depth;
  this.cellSize=cellSize;this.maxRegions=maxRegions;this.lodDistances=lodDistances;this.regions=new Map();this.generation=0;
 }
 get regionCount(){return this.regions.size;}
 key(x,y,z){return x+','+y+','+z;}
 refresh(player,budget=2,actors=[]){
  const s=this.cellSize,px=player.x??player[0],py=player.y??player[1],pz=player.z??player[2];
  const cx=Math.floor(px/s),cy=Math.floor(py/s),cz=Math.floor(pz/s);
  const bodies=actors.length?actors:[{min:[px,py,pz],max:[px,py,pz]}];
  const candidates=[];
  // Populate a broad neighborhood, prioritized by proximity. Existing entries
  // are refreshed without rebuilding, even when new construction is deferred.
  for(let x=cx-2;x<=cx+2;x++)for(let y=cy-2;y<=cy+2;y++)for(let z=cz-2;z<=cz+2;z++){
   const dist=(x+.5-px/s)**2+(y+.5-py/s)**2+(z+.5-pz/s)**2;
   if(dist>6.75)continue;
   // Quantize actors to suppress needless rebuilds while they remain in a cell.
   const regionCenter=[(x+.5)*s,(y+.5)*s,(z+.5)*s];
   const nearby=bodies.filter(b=>b.min.every((v,i)=>v<=regionCenter[i]+s/2+48&&b.max[i]>=regionCenter[i]-s/2-48));
   const signature=nearby.map(b=>b.min.map((v,i)=>Math.floor((v+b.max[i])/4)).join(':')).sort().join('|');
   candidates.push({x,y,z,dist,signature,key:this.key(x,y,z)});
  }
  candidates.sort((a,b)=>a.dist-b.dist);
  const active=new Set(candidates.map(c=>c.key));
  for(const c of candidates){
   const previous=this.regions.get(c.key);
   // Refreshing an unchanged region only renews its FIFO age.
   if(previous&&previous.signature===c.signature){
    this.regions.delete(c.key);this.regions.set(c.key,previous);continue;
   }
   if(budget<=0)continue;
   const center=[(c.x+.5)*s,(c.y+.5)*s,(c.z+.5)*s];
   const boxes=this.classify(center,s/2,this.depth,bodies);
   // Create the replacement before retiring old colliders, preserving ground coverage.
   const ids=[],generation=this.generation++;
   boxes.forEach((box,i)=>{const id='ground:'+c.key+':'+generation+':'+i;this.tree.insert(id,box,{kind:'static',shape:'box',owner:'planet'});ids.push(id);});
   if(previous)for(const id of previous.ids)this.tree.remove(id);
   this.regions.delete(c.key);this.regions.set(c.key,{ids,signature:c.signature});budget--;
  }
  // Oldest unrefreshed regions first, but never discard the active neighborhood.
  for(const [key,region] of this.regions){
   if(this.regions.size<=this.maxRegions)break;
   if(active.has(key))continue;
   for(const id of region.ids)this.tree.remove(id);
   this.regions.delete(key);
  }
 }
}
