import {Tree} from './tree.js';

// Conifer is a tree species: its logs enter the shared undifferentiated log pool.
export class Conifer extends Tree {
 constructor({id,position,state='standing'}={}){
  super({id,position,state,woodYield:1});
  this.species='conifer';
  this.logStrength=1.0;
 }
 snapshot(){return {...super.snapshot(),species:this.species,logStrength:this.logStrength};}
}
