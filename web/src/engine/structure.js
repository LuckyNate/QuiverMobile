import {WorldObject} from './world-object.js';

// Player-built world object contract; creation and repairs remain separate workflows.
export class Structure extends WorldObject {
 constructor({id,position,state='built',material='wood',ownerId=null}={}){
  super({id,type:'structure',position,state});
  this.material=material;this.ownerId=ownerId;
 }
 canInteract({playerId=null}={}){return this.ownerId===null||this.ownerId===playerId;}
 snapshot(){return {...super.snapshot(),material:this.material,ownerId:this.ownerId};}
}
