// Biome data only: environmental classification and population policy.
// Existing terrain generation determines the world surface; this cannot alter it.
export class Biome {
 constructor({id,name,resources={},creatures={},tolerances={},grassStyle={}}={}){
  if(!Number.isInteger(id)||id<0||id>=20)throw new RangeError('Biome must map to one D20 root face');
  if(typeof name!=='string'||!name)throw new TypeError('Biome requires a name');
  this.id=id;this.name=name;
  this.resources=Object.freeze({...resources});
  this.creatures=Object.freeze({...creatures});
  this.tolerances=Object.freeze({...tolerances});
  this.grassStyle=Object.freeze({...grassStyle});
 }
 // Stable face key: the one seeded ids and the density profile are written under.
 get key(){return 'F'+String(this.id).padStart(2,'0');}
 // Resources and creatures share one unit: inhabitants per resource cell.
 density(type){return Math.max(0,this.resources[type]??this.creatures[type]??0);}
 // How many of that cell's target may be missing before it replenishes.
 tolerance(type){return Math.max(0,this.tolerances[type]??0);}
 types(){return [...Object.keys(this.resources),...Object.keys(this.creatures)];}
}
