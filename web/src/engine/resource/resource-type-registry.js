// Biome resource types register lifecycle adapters here; no terrain dependencies.
// A resource type is not spawnable until its visual/gameplay adapter is installed.
export class ResourceTypeRegistry {
 constructor(){this.types=new Map();}
 register(type,adapter){
  if(typeof type!=='string'||!type||typeof adapter?.spawn!=='function'||
     typeof adapter?.unload!=='function')throw new TypeError('Resource adapter needs spawn/unload');
  if(this.types.has(type))throw new Error('Duplicate resource adapter: '+type);
  this.types.set(type,adapter);
 }
 canSpawn(type){return this.types.has(type);}
 spawn(type,id,position,cell){return this.types.get(type)?.spawn(id,position,cell)??false;}
 unload(type,id){return this.types.get(type)?.unload(id)??false;}
 isBusy(type,id){return Boolean(this.types.get(type)?.busy?.(id));}
}
