// Read-only resource density policy; never alters terrain or its LOD.
// Density is an expected count per square kilometer, not a per-chunk quota.
export class ResourceDensity {
 constructor({profiles={meadows:{tree:4500,rock:500}},seed='QuiverGL'}={}){
  this.profiles=profiles;
  this.seed=String(seed);
 }
 get(biome,type){
  const density=this.profiles[biome]?.[type]??0;
  return Number.isFinite(density)?Math.max(0,density):0;
 }
 expected(biome,type,areaSquareMeters){return this.get(biome,type)*Math.max(0,areaSquareMeters)/1000000;}
 // Fixed coordinate hash; no Math.random() or dependency on active LOD.
 sample(type,x,y,z){
  let h=2166136261;
  const key=this.seed+':'+type+':'+x+':'+y+':'+z;
  for(let i=0;i<key.length;i++)h=Math.imul(h^key.charCodeAt(i),16777619);
  h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;
  return (h>>>0)/4294967296;
 }
}
