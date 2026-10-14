import {WorldObject} from './world-object.js';

// Resource policy and state only; no renderer or Box3D ownership.
// A resource is graphical until its required tool is equipped.
export class Resource extends WorldObject {
 constructor({id,type,position,state='standing',requiredTool,yieldType,yieldCount=1}={}){
  super({id,type,position,state});
  if(typeof requiredTool!=='string'||!requiredTool)throw new TypeError('Resource requires a tool');
  if(typeof yieldType!=='string'||!yieldType)throw new TypeError('Resource requires a yield type');
  if(!Number.isSafeInteger(yieldCount)||yieldCount<1)throw new RangeError('Invalid resource yield count');
  this.requiredTool=requiredTool;
  this.yieldType=yieldType;
  this.yieldCount=yieldCount;
 }
 canInteract({equippedTool=null}={}){return this.state==='standing'&&equippedTool===this.requiredTool;}
 // Resource contact is enabled only when the interaction rule permits it.
 isSolidFor(context){return this.canInteract(context);}
 snapshot(){return {...super.snapshot(),requiredTool:this.requiredTool,yieldType:this.yieldType,yieldCount:this.yieldCount};}
}
