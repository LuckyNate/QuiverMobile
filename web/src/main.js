import {TerrainHeight,TERRAIN_SEED} from './engine/terrain-height.js';
import * as THREE from 'three';
import {WorldTerrain,RADIUS} from './world.js';
import {WORLD_SETUP,WORLD_SCALE,STARTER_BIOME_FACE} from './engine/world-config.js';
import {faceAtDirection} from './engine/biome-map.js';
import {PlayerSystem} from './player.js';
import {WorldSystem} from './world-system.js';
import {WorldWater} from './water.js';
import {PhysicsWorld} from './physics.js';
import {ResourceHandler} from './engine/resource-handler.js';
import {SharedWorld} from './engine/shared-world.js';
import {Bonfire} from './engine/bonfire.js';
import {GamePanels} from './ui/game-panels.js';
import {createDyePaletteTexture,dyeUV} from './engine/dye-palette.js';

const app=document.getElementById('app');
const bootstrap=document.getElementById('bootstrap');
if(bootstrap)bootstrap.remove();
const ui=document.createElement('div');
// The simulation renders behind the title screen. Readiness, not a timer,
// determines when the player may enter the already running world.
const loading=document.createElement('div');
loading.style.cssText='position:fixed;inset:0;z-index:20;background:#080e18ee;color:#e8f5ff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;text-align:center;padding:24px;box-sizing:border-box;font:15px system-ui';
const gameTitle=document.createElement('h1');
gameTitle.textContent='QUIVER MOBILE';
gameTitle.style.cssText='margin:0;font:700 clamp(30px,8vw,62px) system-ui;letter-spacing:.13em';
const loadingStatus=document.createElement('div');
loadingStatus.setAttribute('role','status');
loadingStatus.setAttribute('aria-live','polite');
loadingStatus.style.cssText='font:14px monospace;white-space:pre-line;max-width:90vw';
const startButton=document.createElement('button');
startButton.textContent='START GAME';startButton.type='button';
startButton.style.cssText='display:none;padding:14px 36px;border:1px solid #8cb7cf;border-radius:5px;background:#254762;color:white;font:700 18px system-ui;touch-action:manipulation';
// Startup tips scroll along the bottom while world initialization continues.
const tipStyle=document.createElement('style');
tipStyle.textContent='@keyframes quiverTipScroll{from{transform:translateX(100vw)}to{transform:translateX(-100%)}}';
const tipTrack=document.createElement('div');
tipTrack.style.cssText='position:absolute;bottom:0;left:0;right:0;overflow:hidden;white-space:nowrap;padding:12px 0;background:#08121bdd;border-top:1px solid #526477;text-align:left;pointer-events:none';
const tipText=document.createElement('span');
tipText.textContent='TIP: Try to use up your old resources before gathering better quality.  Your resources qualities average in inventory.';
tipText.style.cssText='display:inline-block;padding-left:0;font:13px system-ui;animation:quiverTipScroll 19s linear infinite';
tipTrack.append(tipText);
loading.append(tipStyle,gameTitle,loadingStatus,startButton,tipTrack);
app.append(loading);
let started=false;
function loadStatus(message){loadingStatus.textContent=message;}
const stages=new Map();
const reportedErrors=new Map();
let adminPanels=null;
function report(name,state,detail=''){
 stages.set(name,{state,detail:String(detail)});
 const problems=[...stages].filter(([,v])=>v.state==='FAILED');
 const details=problems.map(([n,v])=>n+': '+v.state+(v.detail?' — '+v.detail:'')).join('\n');
 ui.textContent=details;
 ui.style.display='none';
 if(adminPanels)for(const [name,value] of problems){
  const message=name+': FAILED'+(value.detail?' — '+value.detail:'');
  if(reportedErrors.get(name)!==message){adminPanels.print(message);reportedErrors.set(name,message);}
 }
 try{localStorage.setItem('quiver-last-stages',details);}catch{}
}
window.addEventListener('error',e=>report('script','FAILED',e.message));
window.addEventListener('unhandledrejection',e=>report('promise','FAILED',e.reason?.message||String(e.reason)));
ui.style.cssText='position:fixed;top:8px;left:8px;z-index:3;background:#000a;padding:8px;font:12px monospace;max-width:92vw;max-height:45vh;overflow:auto;white-space:pre-wrap;pointer-events:none;display:none';
const controls=document.createElement('div');
controls.style.cssText='position:fixed;bottom:12px;left:12px;z-index:3;display:flex;gap:8px';
app.append(ui,controls);
const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;inset:0;width:100%;height:100%;display:block;touch-action:none';app.prepend(canvas);
report('document','READY');
let renderer=null;
try{
 renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
 if(!(renderer.getContext() instanceof WebGL2RenderingContext))throw new Error('WebGL2 is required');
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));
 renderer.setClearColor(0x87ceeb);
 report('WebGL2','READY');
}catch(error){report('WebGL2','FAILED',error.message);renderer=null;}
const scene=new THREE.Scene();
// Shared tint lookup: dyes inventory and renderer sample the same fixed 8x8 RGB palette.
scene.userData.dyePaletteTexture=createDyePaletteTexture();
scene.userData.dyeUV=dyeUV;
// Sky-blue distance fog blends the world into the matching background at 5 km.
scene.background=new THREE.Color(0x87ceeb);
scene.fog=new THREE.Fog(0x87ceeb,1,5000);
scene.add(new THREE.HemisphereLight(0xeeeeff,0x263b55,2.1));
const sun=new THREE.DirectionalLight(0xffffff,2.0);sun.position.set(90,180,70);scene.add(sun);
const camera=new THREE.PerspectiveCamera(55,1,1,WORLD_SCALE.cameraFarMeters);
const height=new TerrainHeight(TERRAIN_SEED,RADIUS);
let terrain=null;
const water=new WorldWater(scene,RADIUS,{seaLevelOffset:WORLD_SETUP.seaLevelOffsetMeters});
const playerSystem=new PlayerSystem(scene,camera,canvas,RADIUS,report);
playerSystem.setCameraCollision(height,RADIUS);
const player=playerSystem.position;
// Select a deterministic dry, gently sloped Meadows starting location.
// Sample the surrounding capsule footprint, not just the center point.
function meadowsSpawn(){
 const radial=(latitude,longitude)=>{
  const c=Math.cos(latitude);
  return new THREE.Vector3(c*Math.cos(longitude),c*Math.sin(longitude),Math.sin(latitude));
 };
 let best=null,bestScore=Infinity;
 const sea=RADIUS+WORLD_SETUP.seaLevelOffsetMeters;
 for(let row=1;row<36;row++)for(let col=0;col<144;col++){
  const direction=radial(-Math.PI/2+Math.PI*row/36,2*Math.PI*col/144);
  if(faceAtDirection(direction)!==STARTER_BIOME_FACE)continue;
  const surface=height.radius(direction,RADIUS);
  const elevation=surface-RADIUS;
  // Low, green Meadows land, comfortably above the ocean.
  if(elevation<8||elevation>35||surface-sea<5)continue;
  const reference=Math.abs(direction.z)<.9?new THREE.Vector3(0,0,1):new THREE.Vector3(0,1,0);
  const east=new THREE.Vector3().crossVectors(direction,reference).normalize();
  const north=new THREE.Vector3().crossVectors(east,direction).normalize();
  let variation=0,valid=true;
  for(const [x,y] of [[4,0],[-4,0],[0,4],[0,-4],[3,3],[-3,-3]]){
   const neighbor=direction.clone().addScaledVector(east,x/RADIUS)
    .addScaledVector(north,y/RADIUS).normalize();
   const candidateRadius=height.radius(neighbor,RADIUS);
   variation=Math.max(variation,Math.abs(candidateRadius-surface));
   if(candidateRadius-sea<4||Math.abs(candidateRadius-surface)>2){valid=false;break;}
  }
  if(!valid)continue;
  const score=variation*10+Math.abs(elevation-15);
  if(score<bestScore){best=direction;bestScore=score;}
 }
 if(!best)throw new Error('No suitable dry Meadows spawn in seeded terrain');
 // Full capsule has clearance; leave room for Box3D contact settling.
 return best.multiplyScalar(height.radius(best,RADIUS)+2);
}
player.copy(meadowsSpawn());
// Initialize visual LOD from the actual deterministic spawn, not a placeholder pole.
try{terrain=new WorldTerrain(scene,height,player,camera.far);report('terrain setup','READY');}
catch(error){report('terrain setup','FAILED',error.message);}
const sharedWorld=new SharedWorld({ownerId:'local-owner',seed:TERRAIN_SEED});
sharedWorld.join('local-owner',player);
const harvesting=new ResourceHandler(scene,playerSystem,height,RADIUS,{terrain,shared:sharedWorld,playerId:'local-owner',camera});
const panels=new GamePanels({app,canvas,controls:playerSystem.controls,sharedWorld,playerId:'local-owner'});
const bonfire=new Bonfire({scene,shared:sharedWorld,player:playerSystem,playerId:'local-owner',camera,app});
let pendingBonfire=null;
// Tap resources or terrain to walk using the normal player physics path.
const tapRaycaster=new THREE.Raycaster();
const tapNdc=new THREE.Vector2();
playerSystem.controls.onManualMove=()=>{
 pendingBonfire=null;
 playerSystem.cancelDestination();
 harvesting.ground.clearSelection();
};
playerSystem.controls.onTap=(screenX,screenY)=>{
 if(!started||!simulationReady)return;
 const bounds=canvas.getBoundingClientRect();
 tapNdc.set((screenX-bounds.left)/bounds.width*2-1,1-(screenY-bounds.top)/bounds.height*2);
 tapRaycaster.setFromCamera(tapNdc,camera);
 let destination=null,best=Infinity,targetId=null;
 for(const item of harvesting.ground.items.values()){
  if(item.state!=='standing'||!item.group.visible)continue;
  const projected=item.position.clone().project(camera);
  if(projected.z<0||projected.z>1)continue;
  const sx=(projected.x+1)*bounds.width*.5+bounds.left;
  const sy=(1-projected.y)*bounds.height*.5+bounds.top;
  const pixels=Math.hypot(screenX-sx,screenY-sy);
  if(pixels<Math.max(18,48/item.position.distanceTo(camera.position)*8)&&pixels<best){best=pixels;destination=item.position;targetId=item.id;}
 }
 harvesting.ground.select(targetId);
 if(!destination){
  // Intersect a conservative shell, then iteratively refine to true terrain height.
  const ray=tapRaycaster.ray;
  const sphere=new THREE.Sphere(new THREE.Vector3(),RADIUS);
  const hit=ray.intersectSphere(sphere,new THREE.Vector3());
  if(!hit)return;
  let travel=hit.distanceTo(ray.origin);
  for(let i=0;i<7;i++){
   const point=ray.at(travel,new THREE.Vector3());
   const up=point.clone().normalize(),surfaceRadius=height.radius(up,RADIUS);
   const error=point.length()-surfaceRadius;
   const slope=ray.direction.dot(up);
   if(Math.abs(slope)<.08)break;
   travel-=error/slope;
   if(travel<0)return;
  }
  const point=ray.at(travel,new THREE.Vector3());
  if(Math.abs(point.length()-height.radius(point.clone().normalize(),RADIUS))>3)return;
  destination=point;
 }
 if(!targetId&&sharedWorld.getEquippedTool('local-owner')==='hammer'&&!bonfire.exists&&
    (sharedWorld.getInventory('local-owner').logs||0)>=12){
  pendingBonfire=destination.clone();
 }else pendingBonfire=null;
 playerSystem.setDestination(destination);
};
adminPanels=panels;
setInterval(()=>{if(panels.openPanel==='inventory')panels.refreshInventory();},500);
startButton.addEventListener('click',()=>{
 if(started||startButton.disabled)return;
 started=true;
 loading.remove();
 panels.top.panel.style.visibility='visible';
 panels.bottom.panel.style.visibility='visible';
 playerSystem.controls.setEnabled(true);
});
panels.top.panel.style.visibility='hidden';
panels.bottom.panel.style.visibility='hidden';
// Visual-only owner commands. Physics and game simulation remain active.
const renderLayers={terrain:true,water:true,trees:true,player:true,objects:true};
function applyRenderLayers(){
 terrain.setRenderEnabled(renderLayers.terrain);
 water.mesh.visible=renderLayers.water;
 harvesting.renderEnabled=renderLayers.trees;
 harvesting.root.visible=renderLayers.trees;
 playerSystem.visual.root.visible=renderLayers.player;
 aabbDisplay.visible=renderLayers.objects&&debugAabbRequested;
 for(const item of fallingCubes)item.mesh.visible=renderLayers.objects;
}
function setRenderLayer(enabled,args){
 if(args.length!==1)return 'Usage: /render'+(enabled?'on':'off')+' [terrain|water|trees|player|objects|all]';
 const target=args[0].toLowerCase();
 if(target!=='all'&&!Object.prototype.hasOwnProperty.call(renderLayers,target))return 'Unknown render layer: '+target;
 for(const name of target==='all'?Object.keys(renderLayers):[target])renderLayers[name]=enabled;
 applyRenderLayers();
 return (enabled?'Rendering enabled: ':'Rendering disabled: ')+target;
}
panels.registerCommand('renderon',args=>setRenderLayer(true,args),'Show visual world layer');
panels.registerCommand('renderoff',args=>setRenderLayer(false,args),'Hide visual world layer');
for(const [name,value] of stages)if(value.state==='FAILED')report(name,value.state,value.detail);
let lastLogCount=-1;
report('biome resources','READY','Player-centered seeded resource zones (20 D20 biomes)');
// Permanent mathematical solidity is independent of rendered terrain triangles.
let physics=null,fallingCubes=[],playerCollider=null;
let physicsLoading=false,simulationReady=false;
const cyan=new THREE.LineBasicMaterial({color:0x00ffff,depthTest:true,depthWrite:false});
let debugAabbRequested=false;
const aabbDisplay=new THREE.Group();scene.add(aabbDisplay);
aabbDisplay.visible=false;
function boundsAt(p,half){return {min:[p.x-half,p.y-half,p.z-half],max:[p.x+half,p.y+half,p.z+half]};}
function activeCollisionAreas(){
 const areas=[boundsAt(player,5)];
 for(const item of fallingCubes){
  const p=item.body.getPosition();
  areas.push(boundsAt(p,3));
 }
 return areas;
}
if(!terrain)throw new Error('Terrain geometry unavailable');
const worldSystem=new WorldSystem(RADIUS,player,height);
const {octree,solidity,surface}=worldSystem;
terrain.setCollisionSurface(surface);
terrain.updateCollisionSurface(player);
report('terrain geometry','READY',terrain.leafCount+' fixed faces');
report('octree solidity','READY','Implicit 1 m spherical octree');
// One reusable line buffer: write current nearby AABB edges every frame.
// No per-cell Three.js geometry objects or once-per-second rebuild.
const debugLines=new THREE.BufferGeometry();
let debugPositions=new Float32Array(0);
const debugEdges=[[0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7]];
const debugMesh=new THREE.LineSegments(debugLines,cyan);
debugMesh.frustumCulled=false;
aabbDisplay.add(debugMesh);
function drawNearbyStatic(queryBox){
 const entries=solidity.query(queryBox,{kinds:['static']});
 const needed=entries.length*debugEdges.length*6;
 if(debugPositions.length<needed){
  let capacity=Math.max(needed,debugPositions.length*2,1536);
  debugPositions=new Float32Array(capacity);
  debugLines.setAttribute('position',new THREE.BufferAttribute(debugPositions,3).setUsage(THREE.DynamicDrawUsage));
 }
 let index=0;
 for(const {box} of entries){
  const x=box.min[0],y=box.min[1],z=box.min[2],X=box.max[0],Y=box.max[1],Z=box.max[2];
  const corners=[[x,y,z],[X,y,z],[x,Y,z],[X,Y,z],[x,y,Z],[X,y,Z],[x,Y,Z],[X,Y,Z]];
  for(const [a,b] of debugEdges){
   const from=corners[a],to=corners[b];
   debugPositions[index++]=from[0];debugPositions[index++]=from[1];debugPositions[index++]=from[2];
   debugPositions[index++]=to[0];debugPositions[index++]=to[1];debugPositions[index++]=to[2];
  }
 }
 debugLines.setDrawRange(0,index/3);
 if(index)debugLines.attributes.position.needsUpdate=true;
}



async function initializePhysics(){
 try{
  physicsLoading=true;
  loadStatus('Initializing Box3D and registering solid terrain...');
  report('Box3D','LOADING');
  const world=await new PhysicsWorld().init();
  // The player is a dynamic capsule; the octree's AABB is only broad-phase occupancy.
  world.syncStatic(surface,boundsAt(player,5),solidity);
  playerCollider=world.addPlayerCapsule(player,solidity,octree,'player');
  {const p=playerCollider.getPosition();player.set(p.x,p.y,p.z);}
  // A Meadows start must have dry ground and registered collision support.
  if(height.radius(player.clone().normalize(),RADIUS)<=water.radius+3)
   throw new Error('Meadows spawn is too close to the waterline');
  if(world.staticBodies.size===0)throw new Error('No solid terrain registered near Meadows spawn');
  // Meadows starter: no diagnostic falling cubes or other biome content.
  const cubes=[];
  world.syncStatic(surface,activeCollisionAreas(),solidity);
  physics=world;fallingCubes=cubes;simulationReady=true;
  report('Box3D','READY','Meadows starter; player and terrain contacts');
 }catch(error){loadStatus('Physics initialization failed: '+error.message);report('Box3D','FAILED',error.stack||error.message);}
}
report('octree solidity','READY','Implicit planet');
report('Box3D','WAITING','Physics initialization');
window.addEventListener('resize',()=>panels.layout());
// Lightweight on-device profiler. Accumulate per-frame costs and display a one-second average.
const perfTotals={move:0,collision:0,physics:0,lod:0,render:0,frame:0};
let perfFrames=0,perfLast=performance.now();
function profile(name,start){perfTotals[name]+=performance.now()-start;}
function showProfile(){
 const now=performance.now();
 if(now-perfLast<1000)return;
 const divisor=Math.max(1,perfFrames);
 panels.top.profiler.textContent='FPS '+perfFrames
  +' | move '+(perfTotals.move/divisor).toFixed(1)
  +' col '+(perfTotals.collision/divisor).toFixed(1)
  +' phys '+(perfTotals.physics/divisor).toFixed(1)
  +' LOD '+(perfTotals.lod/divisor).toFixed(1)
  +' rnd '+(perfTotals.render/divisor).toFixed(1)
  +' frame '+(perfTotals.frame/divisor).toFixed(1)+' ms';
 for(const name in perfTotals)perfTotals[name]=0;
 perfFrames=0;perfLast=now;
}
// Readiness is evaluated in the running frame loop after world updates.
function updateTitleReadiness(){
 if(started)return;
 const failed=[...stages].filter(([,value])=>value.state==='FAILED');
 const terrainReady=Boolean(terrain&&terrain.requested.size&&terrain.pending.length===0&&!terrain.staging&&
  [...terrain.requested].every(key=>terrain.cache.has(key)));
 const ready=Boolean(renderer&&simulationReady&&physics&&playerCollider&&terrainReady&&stages.get('GLB player')?.state==='READY'&&stages.get('first frame')?.state==='READY'&&!failed.length);
 const lines=[
  'Renderer: '+(renderer?'ready':'waiting'),
  'World and water: '+(terrain?'ready':'waiting'),
  'Terrain LOD: '+(terrainReady?'ready':terrain?'building '+terrain.pending.length+' meshes':'waiting'),
  'Player and physics: '+(simulationReady&&physics&&playerCollider?'ready':'initializing'),
  'Scenery: '+(harvesting?'ready':'waiting'),
  'Avatar: '+(stages.get('GLB player')?.state==='READY'?'ready':'loading'),
  'First rendered frame: '+(stages.get('first frame')?.state==='READY'?'ready':'waiting')
 ];
 if(failed.length){
  lines.push('Initialization failed: '+failed.map(([name,value])=>name+': '+value.detail).join('; '));
  startButton.style.display='none';
 }else if(ready){
  lines.push('Ready to play');
  startButton.style.display='block';
  startButton.disabled=false;
 }else{startButton.style.display='none';}
 loadStatus(lines.join('\n'));
}
let last=performance.now(),elapsed=0,frames=0,lastTerrain=0,resizeW=0,resizeH=0;
function frame(now){
 requestAnimationFrame(frame);
 const perfFrameStart=performance.now();
 perfFrames++;
 try{
 const dt=Math.min(.05,(now-last)/1000);last=now;elapsed+=dt;frames++;
 const logs=sharedWorld.getPlayer('local-owner')?.logs||0;
 if(logs!==lastLogCount){panels.refreshInventory();lastLogCount=logs;}
 const viewWidth=canvas.clientWidth,viewHeight=canvas.clientHeight;
 if(viewWidth!==resizeW||viewHeight!==resizeH){resizeW=viewWidth;resizeH=viewHeight;renderer.setSize(resizeW,resizeH,false);camera.aspect=resizeW/Math.max(1,resizeH);camera.updateProjectionMatrix();}
 if(simulationReady&&physics&&playerCollider){
  const start=performance.now();
  physics.movePlayer(playerCollider,playerSystem.movement(dt),10,player.clone().normalize(),dt);
  profile('move',start);
 }
 playerSystem.updateView(dt);
 harvesting.update(dt,playerCollider);
 if(pendingBonfire&&player.distanceTo(pendingBonfire)<2.4){
  bonfire.build(pendingBonfire);
  pendingBonfire=null;
  playerSystem.cancelDestination();
 }
 bonfire.update(elapsed);
 // Far clipping is world-scaled; near clip stays at one meter.
 water.update(scene,camera,renderer,elapsed);
 // The immutable planet is queryable immediately. Player motion never rebuilds it.
 if(octree){
  try{
   if(!simulationReady&&!physicsLoading)void initializePhysics();
   const up=player.clone().normalize();
   if(simulationReady&&physics){
    // World-space radial gravity; the frame never rotates independently.
    physics.setPlanetGravity(player);
    // Gravity remains active: submerged volume generates upward buoyancy and drag.
    // No collision with sea level; the same terrain collision hulls form the seabed.
    if(playerCollider){
     const up=player.clone().normalize();
     const groundRadius=height.radius(up,RADIUS);
     const immersion=water.immersion(player,groundRadius);
     const swimming=immersion>0;
     playerSystem.setSwimming(swimming);
     if(swimming){
      const velocity=playerCollider.getLinearVelocity();
      const radial=velocity.x*up.x+velocity.y*up.y+velocity.z*up.z;
      const swim=playerSystem.swimAxis()-playerSystem.diveByLooking();
      // Box3D gravity contributes -9.81 m/s²; buoyancy and radial drag
      // are per-frame velocity increments, not forced position corrections.
      const acceleration=(20*immersion+14*swim*immersion-2.5*radial*immersion);
      const delta=acceleration*dt;
      playerCollider.setLinearVelocity({
       x:velocity.x+up.x*delta,y:velocity.y+up.y*delta,z:velocity.z+up.z*delta
      });
     }
    }
    let start=performance.now();
    physics.syncStatic(surface,activeCollisionAreas(),solidity);
    profile('collision',start);
    start=performance.now();
    physics.step(dt);
    profile('physics',start);
    if(playerCollider){const p=playerCollider.getPosition();player.set(p.x,p.y,p.z);}
    for(const item of fallingCubes){
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
   terrain.update(player,false,undefined,camera.far);
   profile('lod',terrainStart);
  }catch(error){report('Box3D','FAILED',error.message);physics=null;}
 }
 if(renderer){
  try{const renderStart=performance.now();renderer.render(scene,camera);profile('render',renderStart);if(frames===1)report('first frame','READY');}
  catch(error){report('render','FAILED',error.message);renderer=null;}
 }
 }catch(error){report('frame logic','FAILED',error.message);}
 profile('frame',perfFrameStart);
 showProfile();
 updateTitleReadiness();

}
report('frame loop','RUNNING');
requestAnimationFrame(frame);
