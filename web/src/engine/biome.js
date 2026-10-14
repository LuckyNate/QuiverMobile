// Biome data only: environmental classification and density policy.
// Existing terrain generation determines the world surface; this cannot alter it.
export class Biome {
 constructor({id,name,resourceDensity={}}={}){
  if(!Number.isInteger(id)||id<0||id>=20)throw new RangeError('Biome must map to one D20 root face');
  if(typeof name!=='string'||!name)throw new TypeError('Biome requires a name');
  this.id=id;this.name=name;this.resourceDensity=Object.freeze({...resourceDensity});
 }
 density(type){return Math.max(0,this.resourceDensity[type]??0);}
}
