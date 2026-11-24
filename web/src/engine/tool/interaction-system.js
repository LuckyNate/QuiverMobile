import {ToolRegistry} from './tool-registry.js';

// Resolves object permissions; Box3D remains the sole body/contact solver.
export class InteractionSystem {
 constructor({tools=new ToolRegistry()}={}){this.tools=tools;}
 canContact(object,{equippedTool=null}={}){
  if(!object||!this.tools.supports(equippedTool,object.type))return false;
  return typeof object.isSolidFor==='function'
   ?object.isSolidFor({equippedTool}):object.canInteract({equippedTool});
 }
}
