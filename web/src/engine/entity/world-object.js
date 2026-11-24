// Base contract for persistent, spatially addressed world entities.
// This class does not own terrain geometry, rendering, or Box3D bodies.
export class WorldObject {
 constructor({id,type,position,state='active'}={}){
  if(typeof id!=='string'||!id)throw new TypeError('WorldObject requires a stable id');
  if(typeof type!=='string'||!type)throw new TypeError('WorldObject requires a type');
  if(!Array.isArray(position)||position.length!==3||!position.every(Number.isFinite))
   throw new TypeError('WorldObject position must be a finite [x,y,z]');
  this.id=id;
  this.type=type;
  this.position=Object.freeze([...position]);
  this.state=state;
 }
 // Subclasses may describe interaction rules without modifying the physics engine.
 canInteract(_context){return false;}
 // Serializes plain data only. Rendering and Box3D runtime handles are excluded.
 snapshot(){return {id:this.id,type:this.type,position:[...this.position],state:this.state};}
}
