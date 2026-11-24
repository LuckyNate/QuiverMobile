import {Resource} from './resource.js';

// Deposits describe contents and required tool, not mesh or terrain geometry.
export class MineralDeposit extends Resource {
 constructor({id,position,mineral='ore',state='standing',yieldCount=1}={}){
  super({id,type:'mineral-deposit',position,state,requiredTool:'pick',yieldType:mineral,yieldCount});
 }
 acceptsContact(context){return this.canInteract(context);}
}
