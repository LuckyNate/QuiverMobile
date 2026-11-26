import {Resource} from '../resource/resource.js';

// What it takes to harvest a tree, declared once. The resource contract's
// required tool is this same constant, so the touch offer, the contact rule and
// the resource can never disagree about which tool a tree answers to.
export const TREE_TOOL='axe';
// How close the avatar has to stand to fell one, in metres.
export const TREE_REACH=2.4;
// The whole harvest rule for a tree: the verb, the tool it needs, how close the
// avatar must stand. Species differ in what they yield, not in how they are taken.
export const TREE_HARVEST=Object.freeze({verb:'fell',tool:TREE_TOOL,reach:TREE_REACH});

// Tree resource contract; the existing TreeHarvestSystem remains the runtime
// implementation until its responsibilities are migrated in separate commits.
export class Tree extends Resource {
 constructor({id,position,state='standing',woodYield=1}={}){
  super({id,type:'tree',position,state,requiredTool:TREE_TOOL,yieldType:'logs',yieldCount:woodYield});
  // Species that bleed or shed something beyond logs set {resource,count} here;
  // collection awards it alongside the log.
  this.secondary=null;
 }
 // All rendered tree parts may participate in axe contact.
 // The collision adapter decides how to represent those parts in Box3D.
 acceptsContact(part,context){
  return this.canInteract(context)&&['trunk','branch','foliage'].includes(part);
 }
}
