import {registerCampRespawnCommand} from './camp-commands.js';

// Every owner console command in one place. Handlers are explicit, never eval'd.
export class ConsoleCommands {
 constructor(game){this.game=game;}
 register(){
  const game=this.game,panels=game.panels;
  registerCampRespawnCommand(panels.console,{sharedWorld:game.sharedWorld,playerId:'local-owner'});
  panels.registerCommand('renderon',args=>this.setLayer(true,args),'Show visual world layer');
  panels.registerCommand('renderoff',args=>this.setLayer(false,args),'Hide visual world layer');
  panels.registerCommand('reset',()=>game.hardReset('RESETTING'),'Hard reset: blank the window and restart the engine');
  panels.registerCommand('wipe',args=>this.wipe(args),'Erase inventory, dyes and harvested resources, then restart');
  panels.registerCommand('stuck',()=>this.escape(),'Escape if wedged in terrain or objects');
  panels.registerCommand('suicide',()=>this.returnToStart(),'Reset character progress and respawn at the Meadows start');
 }
 setLayer(enabled,args){
  const layers=this.game.renderLayers;
  if(args.length!==1)return 'Usage: /render'+(enabled?'on':'off')+' [terrain|water|trees|player|objects|all]';
  const target=args[0].toLowerCase();
  if(target!=='all'&&!Object.prototype.hasOwnProperty.call(layers,target))return 'Unknown render layer: '+target;
  for(const name of target==='all'?Object.keys(layers):[target])layers[name]=enabled;
  this.game.applyRenderLayers();
  return (enabled?'Rendering enabled: ':'Rendering disabled: ')+target;
 }
 wipe(args){
  if(args.length!==1||args[0].toLowerCase()!=='confirm')return 'Usage: /wipe confirm — erases inventory, dyes and harvested resources';
  if(!this.game.sharedWorld.wipeGathering('local-owner'))return 'Nothing to wipe';
  return this.game.hardReset('WIPING');
 }
 escape(){
  const game=this.game,collider=game.playerCollider;
  if(!game.simulationReady||!collider)return 'Player physics not ready';
  game.setBonfireCandidate(null);
  game.playerSystem.cancelDestination();
  game.harvesting.ground.clearSelection();
  collider.knockback=null;
  if(!collider.panicEscape())return 'Not stuck: position already clear';
  game.syncAvatarToCapsule();
  return 'Moved to the nearest clear ground';
 }
 returnToStart(){
  const game=this.game,collider=game.playerCollider;
  if(!game.simulationReady||!collider)return 'Player physics not ready';
  game.setBonfireCandidate(null);
  game.playerSystem.cancelDestination();
  game.harvesting.ground.clearSelection();
  collider.knockback=null;
  collider.placeAt({x:game.spawnPoint.x,y:game.spawnPoint.y,z:game.spawnPoint.z});
  if(!collider.clear(collider.getPosition()))collider.panicEscape();
  game.syncAvatarToCapsule();
  return 'Character reset at the Meadows start';
 }
}
