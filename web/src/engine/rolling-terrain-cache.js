// Persistent world-aligned terrain chunks. Refreshing a chunk only updates age;
// collider geometry and octree entries remain stable until safe retirement.
export class RollingTerrainCache {
 constructor(tree,{classify,depth=8,cellSize=16,maxRegions=48}) {
  this.tree=tree;this.classify=classify;this.depth=depth;
  this.cellSize=cellSize;this.maxRegions=maxRegions;this.regions=new Map();
 }
 get regionCount(){return this.regions.size;}
 key(x,y,z){return x+','+y+','+z;}
 refresh(player,budget=2){
  const s=this.cellSize,px=player.x??player[0],py=player.y??player[1],pz=player.z??player[2];
  const cx=Math.floor(px/s),cy=Math.floor(py/s),cz=Math.floor(pz/s);
  const candidates=[];
  // Populate a broad neighborhood, prioritized by proximity. Existing entries
  // are refreshed without rebuilding, even when new construction is deferred.
  for(let x=cx-2;x<=cx+2;x++)for(let y=cy-2;y<=cy+2;y++)for(let z=cz-2;z<=cz+2;z++){
   const dist=(x+.5-px/s)**2+(y+.5-py/s)**2+(z+.5-pz/s)**2;
   if(dist>6.75)continue;
   candidates.push({x,y,z,dist,key:this.key(x,y,z)});
  }
  candidates.sort((a,b)=>a.dist-b.dist);
  const active=new Set(candidates.map(c=>c.key));
  for(const c of candidates){
   if(this.regions.has(c.key)){
    const region=this.regions.get(c.key);
    this.regions.delete(c.key);this.regions.set(c.key,region);
   }else if(budget>0){
    const center=[(c.x+.5)*s,(c.y+.5)*s,(c.z+.5)*s];
    const boxes=this.classify(center,s/2,this.depth);
    const ids=[];
    boxes.forEach((box,i)=>{const id='ground:'+c.key+':'+i;this.tree.insert(id,box,{kind:'static',shape:'box',owner:'planet'});ids.push(id);});
    this.regions.set(c.key,{ids});budget--;
   }
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
