import {SpawnKind} from './spawn-kind.js';

// One index of every inhabitant the world may stream in. Resources and creatures
// register here side by side, so nothing spawns until a kind exists for its type
// and a biome table asks for it.
export class SpawnRegistry {
 constructor(){this.kinds=new Map();}
 register(options){
  const kind=new SpawnKind(options);
  if(this.kinds.has(kind.type))throw new Error('Duplicate spawn kind: '+kind.type);
  this.kinds.set(kind.type,kind);
  return kind;
 }
 get(type){return this.kinds.get(type)||null;}
 has(type){return this.kinds.has(type);}
 canSpawn(type){return this.kinds.has(type);}
 ofCategory(category){return [...this.kinds.values()].filter(kind=>kind.category===category);}
 spawn(type,id,position,context){return this.kinds.get(type)?.spawn(id,position,context)??false;}
 unload(type,id){return this.kinds.get(type)?.unload(id)??false;}
 isBusy(type,id){return Boolean(this.kinds.get(type)?.busy(id));}
 get size(){return this.kinds.size;}
}
