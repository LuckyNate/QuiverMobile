// Stable identity index. Objects own state; the registry only owns membership.
export class ObjectRegistry {
 constructor(){this.objects=new Map();}
 add(object){
  if(!object?.id)throw new TypeError('Registered object requires an id');
  if(this.objects.has(object.id))throw new Error('Duplicate world object: '+object.id);
  this.objects.set(object.id,object);
  return object;
 }
 get(id){return this.objects.get(id)||null;}
 has(id){return this.objects.has(id);}
 remove(id){const item=this.get(id);this.objects.delete(id);return item;}
 values(){return this.objects.values();}
 byType(type){return [...this.objects.values()].filter(object=>object.type===type);}
 get size(){return this.objects.size;}
 clear(){this.objects.clear();}
}
