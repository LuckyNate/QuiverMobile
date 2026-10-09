// Unified world-space AABB octree. Every object has an identity and occupies
// the same partition: static geometry, terrain triangles, player and dynamics.
// No rendering imports, local tangent coordinate systems or test platforms.
const copy=b=>({min:[...b.min],max:[...b.max]});
const valid=b=>b&&b.min?.length===3&&b.max?.length===3&&b.min.every((v,i)=>Number.isFinite(v)&&Number.isFinite(b.max[i])&&v<=b.max[i]);
export const intersects=(a,b)=>a.min.every((v,i)=>v<=b.max[i]&&a.max[i]>=b.min[i]);
export const sweptBounds=(a,b)=>({min:a.min.map((v,i)=>Math.min(v,b.min[i])),max:a.max.map((v,i)=>Math.max(v,b.max[i]))});
export function triangleBounds(a,b,c) {
 return {min:[0,1,2].map(i=>Math.min(a[i],b[i],c[i])),max:[0,1,2].map(i=>Math.max(a[i],b[i],c[i]))};
}
function merge(a,b){
 for(let axis=0;axis<3;axis++){
  const other=[0,1,2].filter(i=>i!==axis);
  if(other.every(i=>a.min[i]===b.min[i]&&a.max[i]===b.max[i])&&
    (a.max[axis]===b.min[axis]||b.max[axis]===a.min[axis]))
   return {min:a.min.map((v,i)=>Math.min(v,b.min[i])),max:a.max.map((v,i)=>Math.max(v,b.max[i]))};
 }
 return null;
}
const contains=(outer,inner)=>outer.min.every((v,i)=>inner.min[i]>=v&&inner.max[i]<=outer.max[i]);
class Node {
 constructor(center,half,level){this.center=center;this.half=half;this.level=level;this.ids=new Set();this.children=null;}
 bounds(){return {min:this.center.map(v=>v-this.half),max:this.center.map(v=>v+this.half)};}
 childIndex(box){
  let index=0;
  for(let i=0;i<3;i++){
   if(box.max[i]<this.center[i])continue;
   if(box.min[i]>this.center[i])index|=1<<i;
   else return -1; // Spanning the split plane: retain at parent.
  }
  return index;
 }
 child(index){
  if(!this.children)this.children=Array(8).fill(null);
  if(!this.children[index]){
   const h=this.half/2;
   this.children[index]=new Node(this.center.map((v,i)=>v+((index>>i&1)?h:-h)),h,this.level+1);
  }
  return this.children[index];
 }
}
export class WorldOctree {
 constructor({center=[0,0,0],halfSize=256,maxDepth=9}={}){
  if(!Number.isFinite(halfSize)||halfSize<=0||maxDepth<0)throw new RangeError('Invalid octree dimensions');
  this.root=new Node([...center],halfSize,0);this.maxDepth=maxDepth;
  this.objects=new Map();this.locations=new Map();
 }
 insert(id,box,{kind='static',shape='box',owner=id,triangle=null}={}){
  if(this.objects.has(id))throw new Error('Duplicate occupancy ID: '+id);
  if(!valid(box))throw new TypeError('Invalid AABB');
  if(!contains(this.root.bounds(),box))throw new RangeError('Occupant outside octree root: '+id);
  const entry={id,box:copy(box),kind,shape,owner,triangle};
  this.objects.set(id,entry);this._index(entry);return entry;
 }
 _index(entry){
  let node=this.root;
  while(node.level<this.maxDepth){
   const i=node.childIndex(entry.box);if(i===-1)break;
   node=node.child(i);
  }
  node.ids.add(entry.id);this.locations.set(entry.id,node);
 }
 remove(id){
  const node=this.locations.get(id);
  if(!node)return false;
  node.ids.delete(id);this.locations.delete(id);this.objects.delete(id);return true;
 }
 update(id,box){
  const entry=this.objects.get(id);if(!entry)throw new Error('Unknown occupant: '+id);
  if(!valid(box)||!contains(this.root.bounds(),box))throw new RangeError('Invalid or out-of-range AABB');
  const node=this.locations.get(id);const next=copy(box);
  // Retain node if box still fits and cannot descend into a single child.
  entry.box=next;
  if(contains(node.bounds(),next)&&(node.level===this.maxDepth||node.childIndex(next)===-1))return;
  node.ids.delete(id);this._index(entry);
 }
 get(id){return this.objects.get(id);}
 query(box,{exclude=null,kinds=null}={}){
  if(!valid(box))throw new TypeError('Invalid query AABB');
  const result=[];
  const visit=node=>{
   if(!intersects(node.bounds(),box))return;
   for(const id of node.ids){
    const item=this.objects.get(id);
    if(id!==exclude&&(!kinds||kinds.includes(item.kind))&&intersects(item.box,box))result.push(item);
   }
   for(const child of node.children||[])if(child)visit(child);
  };
  visit(this.root);return result;
 }
 candidates(id,nextBounds=null){
  const entry=this.objects.get(id);if(!entry)throw new Error('Unknown occupant: '+id);
  return this.query(nextBounds?sweptBounds(entry.box,nextBounds):entry.box,{exclude:id});
 }
 // Physical solidity is not inferred from a triangle's enclosing AABB. The
 // triangle remains the narrow-phase shape; the AABB is broad-phase occupancy.
 insertTerrainTriangles(owner,positions,{offset=0}={}){
  if(positions.length%9!==0)throw new RangeError('Expected unindexed triangle XYZ triples');
  for(let i=0;i<positions.length;i+=9){
   const a=Array.from(positions.slice(i,i+3)),b=Array.from(positions.slice(i+3,i+6)),c=Array.from(positions.slice(i+6,i+9));
   this.insert(owner+':tri:'+String(offset+i/9),triangleBounds(a,b,c),{kind:'static',shape:'triangle',owner,triangle:[a,b,c]});
  }
 }
 // Merge only identical-owner rectangular static box occupancy; never merge
 // triangles or distinct objects, even if their bounding boxes touch.
 compactStatic(owner){
  const boxes=[...this.objects.values()].filter(x=>x.owner===owner&&x.kind==='static'&&x.shape==='box');
  let changed=true;
  while(changed){
   changed=false;
   outer:for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
    const joined=merge(boxes[i].box,boxes[j].box);
    if(joined){
     const keep=boxes[i],drop=boxes[j];this.remove(keep.id);this.remove(drop.id);
     const next=this.insert(keep.id,joined,{kind:'static',shape:'box',owner});
     boxes.splice(j,1);boxes.splice(i,1,next);changed=true;break outer;
    }
   }
  }
  return boxes.length;
 }
 // World-coordinate descriptors passed to the Box3D adapter; only local broad-
 // phase matches are included. Triangles must receive triangle narrow-phase.
 physicsCandidates(id,nextBounds=null){
  return this.candidates(id,nextBounds).filter(x=>x.kind==='static'||x.kind==='dynamic'||x.kind==='player');
 }
}
