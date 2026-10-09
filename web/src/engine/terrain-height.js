// Deterministic world-space 3D value noise. Every text seed is valid, including "".
export const TERRAIN_SEED='QuiverGL';
export const TERRAIN_AMPLITUDE=34;
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
  // Input is unit radial direction; samples use planet-scaled coordinates.
  const x=direction.x*1024,y=direction.y*1024,z=direction.z*1024;
  return 24*this.noise(x/512,y/512,z/512)
        +8*this.noise(x/128,y/128,z/128)
        +2*this.noise(x/32,y/32,z/32);
 }
 radius(direction,baseRadius){return baseRadius+this.height(direction);}
}
