// Deterministic world-space 3D value noise. Every text seed is valid, including "".
export const TERRAIN_SEED='QuiverGL';
export const TERRAIN_AMPLITUDE_RATIO=.27; // Conservative global bound relative to radius.
export function seedHash(text){
 let h=2166136261;
 for(const byte of new TextEncoder().encode(String(text))){h=Math.imul(h^byte,16777619);}
 return h>>>0;
}
export class TerrainHeight {
 constructor(seed=TERRAIN_SEED,planetRadius=1){this.seed=String(seed);this.hash=seedHash(this.seed);this.planetRadius=planetRadius;}
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
  // Unit-sphere sample coordinates: every wavelength and amplitude scales with radius.
  // The broad baseline is sampled first so fine noise cannot change its own biome.
  const x=direction.x,y=direction.y,z=direction.z,r=this.planetRadius;
  const broad=.16*r*this.noise(x*3,y*3,z*3)
             +.065*r*this.noise(x*9,y*9,z*9);
  const blend=(start,end)=>{
   const t=Math.max(0,Math.min(1,(broad/r-start)/(end-start)));
   return t*t*(3-2*t);
  };
  const foothill=blend(.003,.035),highland=blend(.02,.095),mountain=blend(.065,.15);
  const plains=.0005*r*this.noise(x*38,y*38,z*38);
  const hills=.018*r*foothill*this.noise(x*27,y*27,z*27);
  const ridge=.009*r*mountain*(1-Math.abs(this.noise(x*85,y*85,z*85)));
  const detail=.003*r*highland*this.noise(x*190,y*190,z*190);
  const crevice=-.006*r*mountain*Math.pow(1-Math.abs(this.noise(x*130,y*130,z*130)),8);
  const surface=.0006*r*this.noise(x*650,y*650,z*650);
  return broad+plains+hills+ridge+detail+crevice+surface;
 }
 radius(direction,baseRadius){return baseRadius+this.height(direction);}
}
