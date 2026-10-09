// Deterministic world-space 3D value noise. Every text seed is valid, including "".
export const TERRAIN_SEED='QuiverGL';
export const TERRAIN_AMPLITUDE=440; // Conservative maximum displacement for sparse occupancy.
export function seedHash(text){
 let h=2166136261;
 for(const byte of new TextEncoder().encode(String(text))){h=Math.imul(h^byte,16777619);}
 return h>>>0;
}
export class TerrainHeight {
 constructor(seed=TERRAIN_SEED){this.seed=String(seed);this.hash=seedHash(this.seed);}
 lattice(x,y,z){
  let h=this.hash;
  h=Math.imul(h^(x|0),0x85ebca6b);h=Math.imul(h^(y|0),0xc2b2ae35);h=Math.imul(h^(z|0),0x27d4eb2f);
  h=Math.imul(h^(h>>>16),0x7feb352);h=Math.imul(h^(h>>>15),0x846ca68b);
  return ((h^(h>>>16))>>>0)/2147483647.5-1;
 }
 noise(x,y,z){
  const i=Math.floor(x),j=Math.floor(y),k=Math.floor(z);
  const u=x-i,v=y-j,w=z-k;
  const f=t=>t*t*(3-2*t),a=f(u),b=f(v),c=f(w);
  const mix=(p,q,t)=>p+(q-p)*t;
  const v00=mix(this.lattice(i,j,k),this.lattice(i+1,j,k),a);
  const v10=mix(this.lattice(i,j+1,k),this.lattice(i+1,j+1,k),a);
  const v01=mix(this.lattice(i,j,k+1),this.lattice(i+1,j,k+1),a);
  const v11=mix(this.lattice(i,j+1,k+1),this.lattice(i+1,j+1,k+1),a);
  return mix(mix(v00,v10,b),mix(v01,v11,b),c);
 }
 height(direction){
  // Broad geography determines the terrain zone BEFORE roughness is added.
  // Sampling radial world coordinates keeps results continuous across D20 faces and LODs.
  const x=direction.x*1024,y=direction.y*1024,z=direction.z*1024;
  const base=245*this.noise(x/1800,y/1800,z/1800)
            +100*this.noise(x/650,y/650,z/650)-8;
  const blend=(start,end,v)=>{
   const t=Math.max(0,Math.min(1,(v-start)/(end-start)));
   return t*t*(3-2*t);
  };
  // Wetlands and coasts are quiet; hills appear progressively inland/uphill.
  const foothill=blend(8,85,base);
  const highland=blend(65,215,base);
  const mountain=blend(175,275,base);
  const plains=1.5*this.noise(x/240,y/240,z/240);
  const hills=14*foothill*this.noise(x/140,y/140,z/140);
  const detail=(.6+3.4*highland)*this.noise(x/32,y/32,z/32);
  const ridgeSample=this.noise(x/95,y/95,z/95);
  const ridges=38*mountain*(1-Math.abs(ridgeSample));
  // Narrow cuts become significant only in elevated mountainous regions.
  const crevices=-30*mountain*Math.pow(1-Math.abs(this.noise(x/42,y/42,z/42)),8);
  return base+plains+hills+detail+ridges+crevices;
 }
 radius(direction,baseRadius){return baseRadius+this.height(direction);}
}
