import {Resource} from './resource.js';

// Tree resource contract; the existing TreeHarvestSystem remains the runtime
// implementation until its responsibilities are migrated in separate commits.
export class Tree extends Resource {
 constructor({id,position,state='standing',woodYield=1}={}){
  super({id,type:'tree',position,state,requiredTool:'axe',yieldType:'logs',yieldCount:woodYield});
 }
 // All rendered tree parts may participate in axe contact.
 // The collision adapter decides how to represent those parts in Box3D.
 acceptsContact(part,context){
  return this.canInteract(context)&&['trunk','branch','foliage'].includes(part);
 }
}
