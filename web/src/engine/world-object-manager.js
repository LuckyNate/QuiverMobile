import {ObjectRegistry} from './object-registry.js';

// Coordinates object membership without owning geometry, physics, or persistence.
export class WorldObjectManager {
 constructor({registry=new ObjectRegistry(),saveState=null}={}){
  this.registry=registry;this.saveState=saveState;
 }
 spawn(object){return this.registry.add(object);}
 find(id){return this.registry.get(id);}
 objectsOfType(type){return this.registry.byType(type);}
 setState(id,state){
  const object=this.find(id);
  if(!object)return false;
  object.state=state;
  this.saveState?.(object.id,object.snapshot());
  return true;
 }
 despawn(id){return this.registry.remove(id);}
}
