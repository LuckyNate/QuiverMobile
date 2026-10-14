import {WorldObject} from './world-object.js';

// Decorative environmental objects are visual-only unless a subclass opts in.
export class EnvironmentalObject extends WorldObject {
 constructor({id,position,state='active',type='environment'}={}){
  super({id,type,position,state});
 }
 canInteract(){return false;}
}
