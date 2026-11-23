import {ConsolePanel} from './console.js';
import {panelLayout} from './panel-layout.js';
import {panelInventory} from './panel-inventory.js';
import {panelGear} from './panel-gear.js';

// Fixed-layout inventory and admin console overlay the full-size WebGL canvas.
// Layout, inventory and gear rendering live in their own modules; this class
// owns the panel instances, the console and the shared wiring.
export class GamePanels {
 constructor({app,canvas,controls,sharedWorld,playerId}){
  this.canvas=canvas;this.controls=controls;this.sharedWorld=sharedWorld;
  this.playerId=playerId;this.openPanel=null;
  this.top=this.makePanel(app,'admin','ADMIN','top');
  this.bottom=this.makePanel(app,'inventory','INVENTORY','bottom');
  this.slots=new Map();
  this.makeInventory();
  this.console=new ConsolePanel({container:this.top.content,sharedWorld,playerId});
  this.layout();
 }
 registerCommand(name,handler,description=''){this.console.registerCommand(name,handler,description);}
 print(message){this.console.print(message);}
}
Object.assign(GamePanels.prototype,panelLayout,panelInventory,panelGear);
