// Fixed world solidity: disjoint, maximal rectangular solid AABBs indexed in an octree.
// A face contact merges only when the other two intervals match exactly.
export function overlaps(a,b) { return a.min.every((v,i)=>v<=b.max[i]&&a.max[i]>=b.min[i]); }
const EPS=1e-7;
export function mergeBoxes(boxes){
 let current=boxes.map(({box,id})=>({box:{min:[...box.min],max:[...box.max]},id}));
 // Merge passes must restart: joining along X can enable a join along Y or Z.
 let changed=true;
 while(changed){
  changed=false;
  outer:for(let i=0;i<current.length;i++)for(let j=i+1;j<current.length;j++){
   const a=current[i].box,b=current[j].box;
   for(let axis=0;axis<3;axis++){
    const other=[0,1,2].filter(k=>k!==axis);
    if(!other.every(k=>Math.abs(a.min[k]-b.min[k])<EPS&&Math.abs(a.max[k]-b.max[k])<EPS))continue;
    const touch=Math.abs(a.max[axis]-b.min[axis])<EPS||Math.abs(b.max[axis]-a.min[axis])<EPS;
    if(!touch)continue;
    const merged={min:a.min.map((v,k)=>Math.min(v,b.min[k])),max:a.max.map((v,k)=>Math.max(v,b.max[k]))};
    const id='merged-'+current[i].id+'-'+current[j].id;
    current.splice(j,1);current.splice(i,1,{box:merged,id});
    changed=true;break outer;
   }
  }
 }
 return current;
}
export class StaticAabbOctree {
 constructor(center=[0,0,0],halfSize=256,maxDepth=8,depth=0) {
  this.center=center;this.halfSize=halfSize;this.maxDepth=maxDepth;this.depth=depth;
  this.items=[];this.children=null;this.sources=[];
 }
 bounds(){const c=this.center,h=this.halfSize;return {min:c.map(v=>v-h),max:c.map(v=>v+h)};}
 insert(box,id) {
  if(this.depth===0){if(!overlaps(box,this.bounds()))throw new Error('Outside static octree root');this.sources.push({box,id});}
  this._insert(box,id);
 }
 _insert(box,id) {
  if(this.depth<this.maxDepth){
   const h=this.halfSize/2;
   for(let i=0;i<8;i++){
    const c=this.center.map((v,k)=>v+((i>>k)&1?h:-h));
    const b={min:c.map(v=>v-h),max:c.map(v=>v+h)};
    if(box.min.every((v,k)=>v>=b.min[k])&&box.max.every((v,k)=>v<=b.max[k])){
     this.children??=Array(8).fill(null);
     this.children[i]??=new StaticAabbOctree(c,h,this.maxDepth,this.depth+1);
     this.children[i]._insert(box,id);return;
    }
   }
  }
  this.items.push({box,id});
 }
 compact(){
  if(this.depth!==0)throw new Error('Compact octree root only');
  const merged=mergeBoxes(this.sources);
  this.items=[];this.children=null;this.sources=merged;
  for(const item of merged)this._insert(item.box,item.id);
  return merged.length;
 }
 query(bounds,out=[]){
  if(!overlaps(bounds,this.bounds()))return out;
  for(const item of this.items)if(overlaps(bounds,item.box))out.push(item);
  for(const c of this.children??[])if(c)c.query(bounds,out);
  return out;
 }
}
