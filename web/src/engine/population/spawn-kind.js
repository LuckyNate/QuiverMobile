// One inhabitant type's whole spawn contract: what it is, where it may stand,
// how long a removed one waits, and which live adapter owns it. A biome table
// says how many of a type a cell holds; a kind says how that type exists.
// Resources and creatures are the same shape, so the streaming layer never
// names a type.
export const SPAWN_CATEGORIES=Object.freeze(['resource','creature']);
export class SpawnKind {
 constructor({type,category='resource',adapter,minElevation=3,maxElevation=Infinity,
  respawnSeconds=Infinity}={}){
  if(typeof type!=='string'||!type)throw new TypeError('Spawn kind requires a type');
  if(!SPAWN_CATEGORIES.includes(category))throw new RangeError('Unknown spawn category: '+category);
  if(typeof adapter?.spawn!=='function'||typeof adapter?.unload!=='function')
   throw new TypeError('Spawn kind '+type+' needs a spawn/unload adapter');
  if(!(minElevation<=maxElevation))throw new RangeError('Spawn kind '+type+' has an empty elevation band');
  // Infinity means a removed inhabitant never comes back on its own.
  if(!(respawnSeconds>=0))throw new RangeError('Spawn kind '+type+' has an invalid respawn delay');
  Object.assign(this,{type,category,adapter,minElevation,maxElevation,respawnSeconds});
  Object.freeze(this);
 }
 // Habitat is the only placement rule the shared streaming layer applies. An
 // adapter still chooses the final standing spot; trees, for one, push apart.
 habitat(elevation){return elevation>=this.minElevation&&elevation<=this.maxElevation;}
 spawn(id,position,context){return this.adapter.spawn(id,position,context);}
 unload(id){return this.adapter.unload(id);}
 busy(id){return Boolean(this.adapter.busy?.(id));}
 // Absent is not the same as removed: an adapter that never reports liveness is
 // assumed to keep everything it spawned, so nothing is replaced behind its back.
 alive(id){return this.adapter.alive?Boolean(this.adapter.alive(id)):true;}
}
