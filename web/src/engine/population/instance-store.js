// One live-instance table for everything the world streams in. A resource, a
// creature and an enemy differ in what they are and what takes them; they never
// differ in how the world holds them, so an id maps to one live instance and to
// the kind that made it. The spawn registry creates and destroys; this remembers,
// which is the whole of instance handling.
export class InstanceStore {
 constructor(){this.byType=new Map();this.typeOfId=new Map();}
 // A slot may hold a record from an earlier life, so the caller decides when to
 // replace one; putting an id that is still live is a bug, not a renewal.
 put(type,id,instance){
  if(typeof type!=='string'||!type)throw new TypeError('Instance needs a kind');
  if(typeof id!=='string'||!id)throw new TypeError('Instance needs an id');
  if(!instance)throw new TypeError('Instance '+id+' has nothing to hold');
  if(this.typeOfId.has(id))throw new Error('Instance '+id+' is already live as '+this.typeOfId.get(id));
  if(!this.byType.has(type))this.byType.set(type,new Map());
  this.byType.get(type).set(id,instance);
  this.typeOfId.set(id,type);
  return instance;
 }
 // The live instance for an id, whichever kind owns it.
 get(id){const type=this.typeOfId.get(id);return type?this.byType.get(type)?.get(id)??null:null;}
 // The same id read as one kind, so a tree cannot be mistaken for a creature.
 of(type,id){return this.byType.get(type)?.get(id)??null;}
 typeOf(id){return this.typeOfId.get(id)??null;}
 has(id){return this.typeOfId.has(id);}
 ids(type){const live=this.byType.get(type);return live?[...live.keys()]:[];}
 count(type){return this.byType.get(type)?.size??0;}
 // The kind's own live table, for a system that already iterates its instances.
 live(type){return this.byType.get(type)??new Map();}
 drop(id){
  const type=this.typeOfId.get(id);
  if(!type)return false;
  this.byType.get(type)?.delete(id);
  this.typeOfId.delete(id);
  return true;
 }
 get size(){return this.typeOfId.size;}
}
