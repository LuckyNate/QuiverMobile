// Only outward-facing, 1 m surface patches exist as collision geometry.
// This cube-sphere parameterization is derived from the same implicit solid
// radius as octree occupancy; no interior AABB faces are generated.
export class SphereSurface {
 constructor(radius,{step=1,depth=2,height=null}={}){
  this.radius=radius;this.step=step;this.depth=depth;this.height=height;
 }
 query(bounds){
  const mid=bounds.min.map((v,i)=>(v+bounds.max[i])*.5);
  const extent=Math.hypot(...bounds.max.map((v,i)=>(v-bounds.min[i])*.5));
  const r=this.radius,s=this.step;
  const patches=[];
  for(let face=0;face<6;face++){
   const axis=Math.floor(face/2),sign=face%2?1:-1;
   const uAxis=(axis+1)%3,vAxis=(axis+2)%3;
   const component=mid[axis]*sign;
   // Skip cube faces which cannot intersect this local query region.
   if(component<=0||Math.abs(mid[axis])<Math.max(Math.abs(mid[uAxis]),Math.abs(mid[vAxis]))-extent*2)continue;
   const denom=Math.max(.001,Math.abs(mid[axis])-extent);
   const u=mid[uAxis]*r/Math.max(.001,Math.abs(mid[axis]));
   const v=mid[vAxis]*r/Math.max(.001,Math.abs(mid[axis]));
   const spread=Math.min(2*r,extent*r/denom*2+s*2);
   const lowU=Math.max(-r,Math.floor((u-spread+r)/s)*s-r);
   const highU=Math.min(r,Math.ceil((u+spread+r)/s)*s-r);
   const lowV=Math.max(-r,Math.floor((v-spread+r)/s)*s-r);
   const highV=Math.min(r,Math.ceil((v+spread+r)/s)*s-r);
   const vertex=(a,b,rad)=>{
    const p=[0,0,0];p[axis]=sign*r;p[uAxis]=a;p[vAxis]=b;
    const magnitude=Math.hypot(...p),direction={x:p[0]/magnitude,y:p[1]/magnitude,z:p[2]/magnitude};
    const actual=rad+(this.height?this.height.height(direction):0);
    return p.map(x=>x*actual/magnitude);
   };
   for(let a=lowU;a<highU-s*.5;a+=s)for(let b=lowV;b<highV-s*.5;b+=s){
    const corners=[vertex(a,b,r),vertex(a+s,b,r),vertex(a+s,b+s,r),vertex(a,b+s,r)];
    const center=corners.reduce((sum,p)=>sum.map((v,i)=>v+p[i]/4),[0,0,0]);
    if(center.some((v,i)=>v<bounds.min[i]-s||v>bounds.max[i]+s))continue;
    const inner=[vertex(a,b,r-this.depth),vertex(a+s,b,r-this.depth),
     vertex(a+s,b+s,r-this.depth),vertex(a,b+s,r-this.depth)];
    const i=Math.round((a+r)/s),j=Math.round((b+r)/s);
    patches.push({id:'surface:'+face+':'+i+':'+j,shape:'hull',
     points:[...corners,...inner],corners});
   }
  }
  return patches;
 }
}
