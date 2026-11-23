import {PhysicsWorld} from '../physics.js';
import {RADIUS} from '../world.js';

// Frame loop, physics bring-up and owner recovery for the game instance.
// Composed onto Game.prototype; each method still uses the game as this.
export const gameRuntime={
 applyRenderLayers(){
  this.terrain.setRenderEnabled(this.renderLayers.terrain);
  this.water.mesh.visible=this.renderLayers.water;
  this.harvesting.renderEnabled=this.renderLayers.trees;
  this.harvesting.root.visible=this.renderLayers.trees;
  this.playerSystem.visual.root.visible=this.renderLayers.player;
  this.debugAabb.setEnabled(this.renderLayers.objects);
  for(const item of this.fallingCubes)item.mesh.visible=this.renderLayers.objects;
 }
,
 setBonfireCandidate(point){this.pendingBonfire=point;}
 // Owner recovery: blank the window, then reload so the engine boots from scratch.
 // Saved data survives a reset; a wipe writes the empty save first, so it is
 // durable even if the reload never happens.
,
 hardReset(label){
  this.resetting=true;
  this.playerSystem.controls.setEnabled(false);
  const blank=document.createElement('div');
  blank.style.cssText='position:fixed;inset:0;z-index:100;background:#090c14;color:#8cb7cf;display:grid;place-items:center;font:600 15px monospace;letter-spacing:.16em';
  blank.textContent=label;
  // Drop the canvas, panels and overlays: a reset means an empty window.
  this.app.replaceChildren(blank);
  // Two frames so the blank window paints before the reload tears it down.
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
   try{location.reload();}catch(error){location.replace(location.href);}
  }));
  return '';
 }
,
 syncAvatarToCapsule(){
  const p=this.playerCollider.getPosition();
  this.player.set(p.x,p.y,p.z);
  // Snap the chase camera instead of sweeping it across the planet.
  this.playerSystem.cameraPosition=null;
 }
,
 boundsAt(p,half){return {min:[p.x-half,p.y-half,p.z-half],max:[p.x+half,p.y+half,p.z+half]};}
,
 activeCollisionAreas(){
  const areas=[this.boundsAt(this.player,5)];
  for(const item of this.fallingCubes){
   const p=item.body.getPosition();
   areas.push(this.boundsAt(p,3));
  }
  return areas;
 }
,
 async initializePhysics(){
  try{
   this.physicsLoading=true;
   this.loading.status('Initializing Box3D and registering solid terrain...');
   this.status.report('Box3D','LOADING');
   const world=await new PhysicsWorld().init();
   // The player is a dynamic capsule; the octree's AABB is only broad-phase occupancy.
   world.syncStatic(this.surface,this.boundsAt(this.player,5),this.solidity);
   this.playerCollider=world.addPlayerCapsule(this.player,this.solidity,this.octree,'player');
   {const p=this.playerCollider.getPosition();this.player.set(p.x,p.y,p.z);}
   // A Meadows start must have dry ground and registered collision support.
   if(this.height.radius(this.player.clone().normalize(),RADIUS)<=this.water.radius+3)
    throw new Error('Meadows spawn is too close to the waterline');
   if(world.staticBodies.size===0)throw new Error('No solid terrain registered near Meadows spawn');
   // Meadows starter: no diagnostic falling cubes or other biome content.
   const cubes=[];
   world.syncStatic(this.surface,this.activeCollisionAreas(),this.solidity);
   this.physics=world;this.fallingCubes=cubes;this.simulationReady=true;
   this.status.report('Box3D','READY','Meadows starter; player and terrain contacts');
  }catch(error){
   this.loading.status('Physics initialization failed: '+error.message);
   this.status.report('Box3D','FAILED',error.stack||error.message);
  }
 }
 // Readiness is evaluated in the running frame loop after world updates.
,
 updateTitleReadiness(){
  if(this.started)return;
  const terrain=this.terrain;
  const failed=this.status.failures();
  const terrainReady=Boolean(terrain&&terrain.requested.size&&terrain.pending.length===0&&!terrain.staging&&
   [...terrain.requested].every(key=>terrain.cache.has(key)));
  const ready=Boolean(this.renderer&&this.simulationReady&&this.physics&&this.playerCollider&&terrainReady&&
   this.status.state('GLB player')==='READY'&&this.status.state('first frame')==='READY'&&!failed.length);
  const lines=[
   'Renderer: '+(this.renderer?'ready':'waiting'),
   'World and water: '+(terrain?'ready':'waiting'),
   'Terrain LOD: '+(terrainReady?'ready':terrain?'building '+terrain.pending.length+' meshes':'waiting'),
   'Player and physics: '+(this.simulationReady&&this.physics&&this.playerCollider?'ready':'initializing'),
   'Scenery: '+(this.harvesting?'ready':'waiting'),
   'Avatar: '+(this.status.state('GLB player')==='READY'?'ready':'loading'),
   'First rendered frame: '+(this.status.state('first frame')==='READY'?'ready':'waiting')
  ];
  if(failed.length){
   lines.push('Initialization failed: '+failed.map(([name,value])=>name+': '+value.detail).join('; '));
   this.loading.showStart(false);
  }else if(ready){
   lines.push('Ready to play');
   this.loading.showStart(true);
  }else this.loading.showStart(false);
  this.loading.status(lines.join('\n'));
 }
,
 frame(now){
  if(this.resetting)return;
  requestAnimationFrame(this.frame);
  const perfFrameStart=performance.now();
  this.profiler.countFrame();
  try{
   const dt=Math.min(.05,(now-this.last)/1000);this.last=now;this.elapsed+=dt;this.frames++;
   const logs=this.sharedWorld.getPlayer('local-owner')?.logs||0;
   if(logs!==this.lastLogCount){this.panels.refreshInventory();this.lastLogCount=logs;}
   this.view.syncSize();
   if(this.simulationReady&&this.physics&&this.playerCollider){
    const start=performance.now();
    this.physics.movePlayer(this.playerCollider,this.playerSystem.movement(dt),6,this.player.clone().normalize(),dt);
    this.profiler.mark('move',start);
   }
   this.playerSystem.updateView(dt);
   this.harvesting.update(dt,this.playerCollider);
   if(this.pendingBonfire&&this.player.distanceTo(this.pendingBonfire)<2.4){
    this.bonfire.build(this.pendingBonfire);
    this.pendingBonfire=null;
    this.playerSystem.cancelDestination();
   }
   this.bonfire.update(this.elapsed);
   // Far clipping is world-scaled; near clip stays at one meter.
   this.water.update(this.scene,this.camera,this.renderer,this.elapsed);
   // The immutable planet is queryable immediately. Player motion never rebuilds it.
   if(this.octree){
    try{
     if(!this.simulationReady&&!this.physicsLoading)void this.initializePhysics();
     const up=this.player.clone().normalize();
     if(this.simulationReady&&this.physics){
      // World-space radial gravity; the frame never rotates independently.
      this.physics.setPlanetGravity(this.player);
      // Gravity remains active: submerged volume generates upward buoyancy and drag.
      if(this.playerCollider){
       const groundRadius=this.height.radius(up,RADIUS);
       const immersion=this.water.immersion(this.player,groundRadius);
       const swimming=immersion>0;
       this.playerSystem.setSwimming(swimming);
       if(swimming){
        const velocity=this.playerCollider.getLinearVelocity();
        const radial=velocity.x*up.x+velocity.y*up.y+velocity.z*up.z;
        const swim=this.playerSystem.swimAxis()-this.playerSystem.diveByLooking();
        // Box3D gravity contributes -9.81 m/s²; buoyancy and radial drag
        // are per-frame velocity increments, not forced position corrections.
        const acceleration=(20*immersion+14*swim*immersion-2.5*radial*immersion);
        const delta=acceleration*dt;
        this.playerCollider.setLinearVelocity({
         x:velocity.x+up.x*delta,y:velocity.y+up.y*delta,z:velocity.z+up.z*delta
        });
       }
      }
      let start=performance.now();
      this.physics.syncStatic(this.surface,this.activeCollisionAreas(),this.solidity);
      this.profiler.mark('collision',start);
      start=performance.now();
      this.physics.step(dt);
      this.profiler.mark('physics',start);
      if(this.playerCollider){const p=this.playerCollider.getPosition();this.player.set(p.x,p.y,p.z);}
      for(const item of this.fallingCubes){
       const p=item.body.getPosition();
       item.mesh.position.set(p.x,p.y,p.z);
       if(typeof item.body.getRotation==='function'){
        const q=item.body.getRotation();
        if(q)item.mesh.quaternion.set(q.x,q.y,q.z,q.w);
       }
      }
     }
     // Terrain detail follows the capsule, independent of camera and zoom.
     const terrainStart=performance.now();
     this.terrain.update(this.player,false,undefined,this.camera.far);
     this.profiler.mark('lod',terrainStart);
    }catch(error){this.status.report('Box3D','FAILED',error.message);this.physics=null;}
   }
   if(this.renderer){
    try{
     const renderStart=performance.now();
     this.renderer.render(this.scene,this.camera);
     this.profiler.mark('render',renderStart);
     if(this.frames===1)this.status.report('first frame','READY');
    }catch(error){this.status.report('render','FAILED',error.message);this.renderer=null;}
   }
  }catch(error){this.status.report('frame logic','FAILED',error.message);}
  this.profiler.mark('frame',perfFrameStart);
  this.profiler.update();
  this.updateTitleReadiness();
 }
};
