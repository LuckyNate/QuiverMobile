import {TerrainHeight,TERRAIN_SEED} from './engine/terrain-height.js';
import * as THREE from 'three';
import {WorldTerrain,RADIUS} from './world.js';
import {PlayerSystem} from './player.js';
import {WorldSystem} from './world-system.js';
import {WorldWater} from './water.js';
import {PhysicsWorld} from './physics.js';

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
 ui.textContent=[...stages].map(([n,v])=>n+': '+v.state+(v.detail?' — '+v.detail:'')).join('\n');
 try{localStorage.setItem('quiver-last-stages',ui.textContent);}catch{}
}
window.addEventListener('error',e=>report('script','FAILED',e.message));
window.addEventListener('unhandledrejection',e=>report('promise','FAILED',e.reason?.message||String(e.reason)));
ui.style.cssText='position:fixed;top:8px;left:8px;z-index:3;background:#000a;padding:8px;font:12px monospace;max-width:92vw;max-height:45vh;overflow:auto;white-space:pre-wrap;pointer-events:none';
const controls=document.createElement('div');
controls.style.cssText='position:fixed;bottom:12px;left:12px;z-index:3;display:flex;gap:8px';
app.append(ui,controls);
const canvas=document.createElement('canvas');canvas.style.cssText='width:100vw;height:100dvh;display:block;touch-action:none';app.prepend(canvas);
report('document','READY');
let renderer=null;
try{
 renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
 if(!(renderer.getContext() instanceof WebGL2RenderingContext))throw new Error('WebGL2 is required');
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));
 renderer.setClearColor(0x0a101c);
 report('WebGL2','READY');
}catch(error){report('WebGL2','FAILED',error.message);renderer=null;}
const scene=new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xeeeeff,0x263b55,2.1));
const sun=new THREE.DirectionalLight(0xffffff,2.0);sun.position.set(90,180,70);scene.add(sun);
const camera=new THREE.PerspectiveCamera(55,1,.05,10000);
const height=new TerrainHeight(TERRAIN_SEED);
let terrain=null;
try{terrain=new WorldTerrain(scene,height);report('terrain setup','READY');}
catch(error){report('terrain setup','FAILED',error.message);}
const water=new WorldWater(scene,RADIUS);
const playerSystem=new PlayerSystem(scene,camera,canvas,RADIUS,report);
const player=playerSystem.position;
player.setLength(height.radius(player.clone().normalize(),RADIUS)+1.3);
// Permanent mathematical solidity is independent of rendered terrain triangles.
let physics=null,fallingCubes=[],playerCollider=null;
let physicsLoading=false,simulationReady=false;
const cyan=new THREE.LineBasicMaterial({color:0x00ffff,depthTest:true,depthWrite:false});
const aabbDisplay=new THREE.Group();scene.add(aabbDisplay);
aabbDisplay.visible=false;
function boundsAt(p,half){return {min:[p.x-half,p.y-half,p.z-half],max:[p.x+half,p.y+half,p.z+half]};}
function activeCollisionAreas(){
 const areas=[boundsAt(player,2)];
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
  playerCollider=world.addPlayerCapsule(player);
  world.syncStatic(surface,boundsAt(player,2));
  if(world.staticBodies.size===0)throw new Error('No solid terrain registered near spawn');
  const group=new THREE.Group();scene.add(group);
  const cubes=[],geometry=new THREE.BoxGeometry(.8,.8,.8);
  const material=new THREE.MeshStandardMaterial({color:0xffa540,roughness:.8});
  const up=player.clone().normalize();
  const east=new THREE.Vector3(0,1,0).cross(up).normalize();
  const north=up.clone().cross(east).normalize();
  for(let i=0;i<20;i++){
   const position=player.clone().addScaledVector(up,4+i*.85)
    .addScaledVector(east,((i%5)-2)*1.15)
    .addScaledVector(north,(Math.floor(i/5)-1.5)*1.15);
   const body=world.addDynamicBox(position.toArray(),.4);
   const mesh=new THREE.Mesh(geometry,material);
   mesh.position.copy(position);group.add(mesh);
   const id='cube-'+i;
   octree.insert(id,boundsAt(position,.4),{kind:'dynamic',owner:id});
   cubes.push({id,body,mesh});
  }
  world.syncStatic(surface,activeCollisionAreas());
  physics=world;fallingCubes=cubes;simulationReady=true;
  loading.remove();
  report('Box3D','READY',cubes.length+' dynamic bodies sharing world octree');
 }catch(error){loadStatus('Physics initialization failed: '+error.message);report('Box3D','FAILED',error.stack||error.message);}
}
report('octree solidity','READY','Implicit planet');
report('Box3D','WAITING','Physics initialization');
let last=performance.now(),elapsed=0,frames=0,lastTerrain=0,resizeW=0,resizeH=0;
function frame(now){
 requestAnimationFrame(frame);
 try{
 const dt=Math.min(.05,(now-last)/1000);last=now;elapsed+=dt;frames++;
 if(innerWidth!==resizeW||innerHeight!==resizeH){resizeW=innerWidth;resizeH=innerHeight;renderer.setSize(resizeW,resizeH,false);camera.aspect=resizeW/resizeH;camera.updateProjectionMatrix();}
 if(simulationReady&&physics&&playerCollider){
  physics.movePlayer(playerCollider,playerSystem.movement(),5,player.clone().normalize());
 }
 playerSystem.updateView();
 water.update(scene,camera,renderer,elapsed);
 // The immutable planet is queryable immediately. Player motion never rebuilds it.
 if(octree){
  try{
   if(!simulationReady&&!physicsLoading)void initializePhysics();
   const up=player.clone().normalize();
   octree.update('player',boundsAt(player,.95));
   if(simulationReady&&physics){
    // World-space radial gravity; the frame never rotates independently.
    physics.setPlanetGravity(player);
    for(const item of fallingCubes){
     const p=item.body.getPosition();
     const v=new THREE.Vector3(p.x,p.y,p.z);
     octree.update(item.id,boundsAt(v,.4));
    }
    physics.syncStatic(surface,activeCollisionAreas());
    physics.step(dt);
    if(playerCollider){const p=playerCollider.getPosition();player.set(p.x,p.y,p.z);octree.update('player',boundsAt(player,.95));}
    for(const item of fallingCubes){
     const p=item.body.getPosition();
     item.mesh.position.set(p.x,p.y,p.z);
     if(typeof item.body.getRotation==='function'){
      const q=item.body.getRotation();
      if(q)item.mesh.quaternion.set(q.x,q.y,q.z,q.w);
     }
     octree.update(item.id,boundsAt(item.mesh.position,.4));
    }
   }
   terrain.update(player);
   if(greenSurface.visible)drawSurface(boundsAt(player,3));
  }catch(error){report('Box3D','FAILED',error.message);physics=null;}
 }
 if(renderer){
  try{renderer.render(scene,camera);if(frames===1)report('first frame','READY');}
  catch(error){report('render','FAILED',error.message);renderer=null;}
 }
 }catch(error){report('frame logic','FAILED',error.message);}

}
report('frame loop','RUNNING');
requestAnimationFrame(frame);
