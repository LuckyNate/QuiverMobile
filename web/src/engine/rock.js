import {Resource} from './resource.js';

// Rock resources require a pick; physics stays in the shared Box3D adapter.
export class Rock extends Resource {
 constructor({id,position,state='standing',stoneYield=1}={}){
  super({id,type:'rock',position,state,requiredTool:'pick',yieldType:'stone',yieldCount:stoneYield});
 }
 acceptsContact(context){return this.canInteract(context);}
}
