// Fixed world solidity: disjoint, maximal rectangular solid AABBs indexed in an octree.
// A face contact merges only when the other two intervals match exactly.
export function overlaps(a,b) { return a.min.every((v,i)=>v<=b.max[i]&&a.max[i]>=b.min[i]); }
const EPS=1e-7;
export function mergeBoxes(boxes){
 let current=boxes.map(({box,id})=>({id,box:{min:[...box.min],max:[...box.max]}}));
 let modified=true;
 while(modified){
  modified=false;
  for(let axis=0;axis<3;axis++){
   const other=[0,1,2].filter(k=>k!==axis);
   const groups=new Map();
   for(const item of current){
    const key=other.flatMap(k=>[item.box.min[k],item.box.max[k]]).map(x=>x.toFixed(7)).join(',');
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(item);
   }
   const next=[];
   for(const items of groups.values()){
    items.sort((a,b)=>a.box.min[axis]-b.box.min[axis]);
    let previous=null;
    for(const item of items){
     if(previous && Math.abs(previous.box.max[axis]-item.box.min[axis])<EPS){
      previous.box.max[axis]=item.box.max[axis];
      modified=true;
     }else{
      previous={id:item.id,box:{min:[...item.box.min],max:[...item.box.max]}};
      next.push(previous);
     }
    }
   }
   current=next;
  }
 }
 current.forEach((item,i)=>item.id='solid-'+i);
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
