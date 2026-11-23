import * as THREE from 'three';
import {TerrainHeight,TERRAIN_SEED} from '../engine/terrain-height.js';
import {WorldTerrain,RADIUS} from '../world.js';
import {WORLD_SETUP} from '../engine/world-config.js';
import {PlayerSystem} from '../player.js';
import {WorldSystem} from '../world-system.js';
import {WorldWater} from '../water.js';
import {ResourceHandler} from '../engine/resource-handler.js';
import {SharedWorld} from '../engine/shared-world.js';
import {Bonfire} from '../engine/bonfire.js';
import {GamePanels} from '../ui/game-panels.js';
import {StatusReport} from '../gui/status-report.js';
import {LoadingScreen} from '../gui/loading-screen.js';
import {Profiler} from '../gui/profiler.js';
import {GameView} from '../engine/game-view.js';
import {SpawnPoint} from '../engine/spawn-point.js';
import {DebugAabb} from '../engine/debug-aabb.js';
import {TapController} from './tap-controller.js';
import {ConsoleCommands} from '../console/commands.js';
import {gameRuntime} from './game-runtime.js';

// One game instance owns the systems, the panels and the frame loop. Each
// system lives in its own script; this class only wires them together.
export class Game {
 constructor({app}){
  this.app=app;
  this.started=false;
  this.resetting=false;
  this.status=new StatusReport();
  this.loading=new LoadingScreen(app);
  const report=(name,state,detail='')=>this.status.report(name,state,detail);
  this.controls=document.createElement('div');
  this.controls.style.cssText='position:fixed;bottom:12px;left:12px;z-index:3;display:flex;gap:8px';
  app.append(this.controls);
  this.canvas=document.createElement('canvas');
  this.canvas.style.cssText='position:fixed;inset:0;width:100%;height:100%;display:block;touch-action:none';
  app.prepend(this.canvas);
  report('document','READY');
  this.view=new GameView({canvas:this.canvas,report});
  this.renderer=this.view.renderer;
  this.scene=this.view.scene;
  this.camera=this.view.camera;
  this.height=new TerrainHeight(TERRAIN_SEED,RADIUS);
  this.terrain=null;
  this.water=new WorldWater(this.scene,RADIUS,{seaLevelOffset:WORLD_SETUP.seaLevelOffsetMeters});
  this.playerSystem=new PlayerSystem(this.scene,this.camera,this.canvas,RADIUS,report);
  this.playerSystem.setCameraCollision(this.height,RADIUS);
  this.player=this.playerSystem.position;
  // Keep the authoritative start pose; character reset returns here.
  this.spawnPoint=new SpawnPoint({height:this.height,radius:RADIUS}).find();
  this.player.copy(this.spawnPoint);
  // Initialize visual LOD from the actual deterministic spawn, not a placeholder pole.
  try{
   this.terrain=new WorldTerrain(this.scene,this.height,this.player,this.camera.far);
   report('terrain setup','READY');
  }catch(error){report('terrain setup','FAILED',error.message);}
  this.sharedWorld=new SharedWorld({ownerId:'local-owner',seed:TERRAIN_SEED});
  this.sharedWorld.join('local-owner',this.player);
  this.harvesting=new ResourceHandler(this.scene,this.playerSystem,this.height,RADIUS,{terrain:this.terrain,shared:this.sharedWorld,playerId:'local-owner',camera:this.camera});
  this.panels=new GamePanels({app,canvas:this.canvas,controls:this.playerSystem.controls,sharedWorld:this.sharedWorld,playerId:'local-owner'});
  this.bonfire=new Bonfire({scene:this.scene,shared:this.sharedWorld,player:this.playerSystem,playerId:'local-owner',camera:this.camera,app});
  this.pendingBonfire=null;
  this.status.onFailed=(problems,reported)=>{
   for(const [name,value] of problems){
    const message=name+': FAILED'+(value.detail?' — '+value.detail:'');
    if(reported.get(name)!==message){this.panels.print(message);reported.set(name,message);}
   }
  };
  this.tap=new TapController({
   canvas:this.canvas,camera:this.camera,height:this.height,radius:RADIUS,
   harvesting:this.harvesting,sharedWorld:this.sharedWorld,playerSystem:this.playerSystem,
   bonfire:this.bonfire,isActive:()=>this.started&&this.simulationReady,
   setBonfireCandidate:point=>{this.pendingBonfire=point;}
  });
  setInterval(()=>{if(this.panels.openPanel==='inventory')this.panels.refreshInventory();},500);
  this.loading.onStart(()=>{
   this.started=true;
   this.panels.top.panel.style.visibility='visible';
   this.panels.bottom.panel.style.visibility='visible';
   this.playerSystem.controls.setEnabled(true);
  });
  this.panels.top.panel.style.visibility='hidden';
  this.panels.bottom.panel.style.visibility='hidden';
  // Visual-only owner commands. Physics and game simulation remain active.
  this.renderLayers={terrain:true,water:true,trees:true,player:true,objects:true};
  this.consoleCommands=net ConsoleCommands(this);
  this.consoleCommands.register();
  for(const [name,value] of this.status.stages)if(value.state==='FAILED')this.status.report(name,value.state,value.detail);
  this.lastLogCount=-1;
  report('biome resources','READY','Player-centered seeded resource zones (20 D20 biomes)');
  // Permanent mathematical solidity is independent of rendered terrain triangles.
  this.physics=null;this.fallingCubes=[];this.playerCollider=null;
  this.physicsLoading=false;this.simulationReady=false;
  this.debugAabb=new DebugAabb(this.scene);
  if(!this.terrain)throw new Error('Terrain geometry unavailable');
  this.worldSystem=new WorldSystem(RADIUS,this.player,this.height);
  this.octree=this.worldSystem.octree;
  this.solidity=this.worldSystem.solidity;
  this.surface=this.worldSystem.surface;
  this.terrain.setCollisionSurface(this.surface);
  this.terrain.updateCollisionSurface(this.player);
  report('terrain geometry','READY',this.terrain.leafCount+' fixed faces');
  report('octree solidity','READY','Implicit 1 m spherical octree');
  report('Box3D','WAITING','Physics initialization');
  window.addEventListener('resize',()=>this.panels.layout());
  this.profiler=new Profiler(this.panels.top.profiler);
  this.last=performance.now();
  this.elapsed=0;this.frames=0;
  this.frame=this.frame.bind(this);
 }
 start(){
  this.status.report('frame loop','RUNNING');
  requestAnimationFrame(this.frame);
 }
}
Object.assign(Game.prototype,gameRuntime);
