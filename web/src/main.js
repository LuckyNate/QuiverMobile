import {TerrainHeight,TERRAIN_SEED} from './engine/terrain-height.js';
import * as THREE from 'three';
import {WorldTerrain,RADIUS} from './world.js';
import {PlayerSystem} from './player.js';
import {WorldSystem} from './world-system.js';
import {WorldWater} from './water.js';
import {PhysicsWorld} from './physics.js';
import {TreeHarvestSystem} from './trees.js';
import {SharedWorld} from './engine/shared-world.js';
import {GamePanels} from './ui/game-panels.js';

const app=document.getElementById('app');
const bootstrap=document.getElementById('bootstrap');
if(bootstrap)bootstrap.remove();
const ui=document.createElement('div');
const loading=document.createElement('div');
loading.style.cssText='position:fixed;inset:0;z-index:10;background:#080e18e8;color:#e8f5ff;display:flex;align-items:center;justify-content:center;font:16px monospace;text-align:center;padding:24px;pointer-events:auto';
loading.textContent='Preparing planet...';
app.append(loading);
function loadStatus(message){loading.textContent=message;}
const stages=new Map();
function report(name,state,detail=''){
 stages.set(name,{state,detail:String(detail)});
 const problems=[...stages].filter(([,v])=>v.state==='FAILED');
 ui.textContent=problems.map(([n,v])=>n+': '+v.state+(v.detail?' — '+v.detail:'')).join('\n');
 ui.style.display=problems.length?'block':'none';
 try{localStorage.setItem('quiver-last-stages',ui.textContent);}catch{}
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
// Sky-blue distance fog blends the world into the matching background at 5 km.
scene.background=new THREE.Color(0x87ceeb);
scene.fog=new THREE.Fog(0x87ceeb,1,5000);
scene.add(new THREE.HemisphereLight(0xeeeeff,0x263b55,2.1));
const sun=new THREE.DirectionalLight(0xffffff,2.0);sun.position.set(90,180,70);scene.add(sun);
const camera=new THREE.PerspectiveCamera(55,1,1,5000);
const height=new TerrainHeight(TERRAIN_SEED,RADIUS);
let terrain=null;
try{terrain=new WorldTerrain(scene,height);report('terrain setup','READY');}
catch(error){report('terrain setup','FAILED',error.message);}
const water=new WorldWater(scene,RADIUS);
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
 const sea=RADIUS-1;
 for(let row=1;row<36;row++)for(let col=0;col<144;col++){
  const direction=radial(-Math.PI/2+Math.PI*row/36,2*Math.PI*col/144);
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
const sharedWorld=new SharedWorld({ownerId:'local-owner',seed:TERRAIN_SEED});
sharedWorld.join('local-owner',player);
const harvesting=new TreeHarvestSystem(scene,playerSystem,height,RADIUS,{shared:sharedWorld,playerId:'local-owner',camera});
const panels=new GamePanels({app,canvas,controls:playerSystem.controls,sharedWorld,playerId:'local-owner'});
let lastLogCount=-1;
report('starter biome','READY','Meadows (other biomes unpopulated)');
// Permanent mathematical solidity is independent of rendered terrain triangles.
let physics=null,fallingCubes=[],playerCollider=null;
let physicsLoading=false,simulationReady=false;
const cyan=new THREE.LineBasicMaterial({color:0x00ffff,depthTest:true,depthWrite:false});
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


// Dark-green surface patches are the same outward faces used by Box3D.
// Rebuild only when the local set of exposed patches changes.
const greenSurface=new THREE.Mesh(new THREE.BufferGeometry(),
 new THREE.MeshBasicMaterial({color:0x145c2b,side:THREE.DoubleSide,depthWrite:true,transparent:false,opacity:1}));
greenSurface.frustumCulled=false;
scene.add(greenSurface);
greenSurface.visible=false;
let surfaceSignature='';
function drawSurface(bounds){
 const patches=surface.query(bounds);
 const signature=patches.map(p=>p.id).join('|');
 if(signature===surfaceSignature)return;
 surfaceSignature=signature;
 const positions=[];
 for(const p of patches){
  // Visual-only 2 cm edge overlap; collision hulls remain unchanged.
  const v=p.corners,center=[0,1,2].map(axis=>v.reduce((sum,corner)=>sum+corner[axis],0)/4);
  const corners=v.map(corner=>{
   const expanded=corner.map((value,axis)=>center[axis]+(value-center[axis])*1.04);
   const length=Math.hypot(...expanded);
   return expanded.map(value=>value*surface.radius*1.00025/length);
  });
  for(const i of [0,1,2,0,2,3])positions.push(...corners[i]);
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.computeVertexNormals();
 greenSurface.geometry.dispose();
 greenSurface.geometry=geometry;
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
  loading.remove();
  report('Box3D','READY','Meadows starter; player and terrain contacts');
 }catch(error){loadStatus('Physics initialization failed: '+error.message);report('Box3D','FAILED',error.stack||error.message);}
}
report('octree solidity','READY','Implicit planet');
report('Box3D','WAITING','Physics initialization');
window.addEventListener('resize',()=>panels.layout());
// Lightweight on-device profiler. Accumulate per-frame costs and display a one-second average.
const perfPanel=document.createElement('div');
perfPanel.style.cssText='position:fixed;left:8px;top:58px;z-index:6;pointer-events:none;background:#000b;color:white;padding:6px;font:11px monospace;white-space:pre';
app.append(perfPanel);
const perfTotals={move:0,collision:0,physics:0,lod:0,render:0,frame:0};
let perfFrames=0,perfLast=performance.now();
function profile(name,start){perfTotals[name]+=performance.now()-start;}
function showProfile(now){
 if(now-perfLast<1000)return;
 const divisor=Math.max(1,perfFrames);
 perfPanel.textContent='ms/frame ('+perfFrames+' fps)\n'
  +Object.entries(perfTotals).map(([name,total])=>name+': '+(total/divisor).toFixed(2)).join('\n');
 for(const name in perfTotals)perfTotals[name]=0;
 perfFrames=0;perfLast=now;
}
let last=performance.now(),elapsed=0,frames=0,lastTerrain=0,resizeW=0,resizeH=0;
function frame(now){
 requestAnimationFrame(frame);
 try{
 const perfFrameStart=performance.now();perfFrames++;
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
 // Fixed clipping range: 1 m near, 5,000 m far.
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
   terrain.update(player);
   profile('lod',terrainStart);
   if(greenSurface.visible)drawSurface(boundsAt(player,3));
  }catch(error){report('Box3D','FAILED',error.message);physics=null;}
 }
 if(renderer){
  try{const renderStart=performance.now();renderer.render(scene,camera);profile('render',renderStart);if(frames===1)report('first frame','READY');}
  catch(error){report('render','FAILED',error.message);renderer=null;}
 }
 }catch(error){report('frame logic','FAILED',error.message);}
 profile('frame',perfFrameStart);
 showProfile(now);

}
report('frame loop','RUNNING');
requestAnimationFrame(frame);
