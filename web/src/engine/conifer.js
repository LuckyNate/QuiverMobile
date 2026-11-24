import {Tree} from './tree.js';

// Conifer is a pine: its logs enter the shared undifferentiated log pool and it
// bleeds pine sap, the first of the per-species drops. A future species sets its
// own secondary (bark, syrup, resin) the same way.
export class Conifer extends Tree {
 constructor({id,position,state='standing'}={}){
  super({id,position,state,woodYield:1});
  this.species='conifer';
  this.logStrength=1.0;
  this.secondary={resource:'pineSap',count:2};
 }
 snapshot(){return {...super.snapshot(),species:this.species,logStrength:this.logStrength};}
}
