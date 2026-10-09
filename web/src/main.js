import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {WorldTerrain,RADIUS} from './world.js';
import {WorldOctree} from './engine/world-octree.js';
import {buildSolidSphere} from './engine/terrain-occupancy.js';
import {mergeSolidBoxes} from './engine/rolling-terrain-cache.js';
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
const wireBtn=document.createElement('button');wireBtn.textContent='Gravity: ON';wireBtn.style.cssText='font-size:14px;padding:10px';
controls.append(wireBtn);app.append(ui,controls);
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
const camera=new THREE.PerspectiveCamera(55,1,.05,2000);
let terrain=null;
try{terrain=new WorldTerrain(scene);report('terrain setup','READY');}
catch(error){report('terrain setup','FAILED',error.message);}
let up=new THREE.Vector3(0,0,1),east=new THREE.Vector3(1,0,0),north=new THREE.Vector3(0,1,0);
let player=up.clone().multiplyScalar(RADIUS+1.3),yaw=0,pitch=.35,zoom=8,moveX=0,moveY=0;
let avatar=null;
report('GLB player','LOADING');
new GLTFLoader().loadAsync(import.meta.env.BASE_URL+'models/debug/player_capsule.glb')
.then(capsule=>{avatar=capsule.scene;scene.add(avatar);report('GLB player','READY');})
.catch(error=>report('GLB player','FAILED',error.message));
const keys=new Set();window.addEventListener('keydown',e=>{keys.add(e.key.toLowerCase());if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key.toLowerCase()))e.preventDefault();});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
let touches=new Map(),lookPointer=null;
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);touches.set(e.pointerId,{x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY});if(e.clientX>innerWidth/2)lookPointer=e.pointerId;});
canvas.addEventListener('pointermove',e=>{const p=touches.get(e.pointerId);if(!p)return;
 const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
 if(e.pointerId===lookPointer){yaw-=dx*.007;pitch=THREE.MathUtils.clamp(pitch+dy*.007,-.1,1.45);}
 else{moveX=THREE.MathUtils.clamp((e.clientX-p.startX)/90,-1,1);moveY=THREE.MathUtils.clamp((p.startY-e.clientY)/90,-1,1);}
});
function release(e){touches.delete(e.pointerId);if(lookPointer===e.pointerId)lookPointer=null;if(![...touches].some(([id,p])=>id!==lookPointer)){moveX=0;moveY=0;}}
canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=THREE.MathUtils.clamp(zoom*Math.exp(e.deltaY*.001),3,30000);},{passive:false});
const gravityArrow=new THREE.ArrowHelper(new THREE.Vector3(0,0,-1),player,6,0xff00ff,1.2,.7);scene.add(gravityArrow);
wireBtn.addEventListener('click',()=>{gravityArrow.visible=!gravityArrow.visible;wireBtn.textContent='Gravity: '+(gravityArrow.visible?'ON':'OFF');});

// Permanent mathematical solidity is independent of rendered terrain triangles.
let physics=null,fallingCubes=[],octree=null,playerCollider=null;
let solidWork=null,solidBoxes=[],mergedSolids=null,solidInsertIndex=0,solidityReady=false,physicsLoading=false,simulationReady=false;
const cyan=new THREE.LineBasicMaterial({color:0x00ffff,depthTest:true,depthWrite:false});
const aabbDisplay=new THREE.Group();scene.add(aabbDisplay);
function boundsAt(p,half){return {min:[p.x-half,p.y-half,p.z-half],max:[p.x+half,p.y+half,p.z+half]};}
function activeCollisionAreas(){
 const areas=[boundsAt(player,26)];
 for(const item of fallingCubes){
  const p=item.body.getPosition();
  areas.push(boundsAt(p,8));
 }
 return areas;
}
function registerTerrain(){
 if(!terrain)throw new Error('Terrain geometry unavailable');
 octree=new WorldOctree({center:[0,0,0],halfSize:256,maxDepth:9});
 octree.insert('player',boundsAt(player,.95),{kind:'player',owner:'player'});
 // Build one permanent planet from cubic octree cells, core first.
 // Only after construction do we merge face-adjacent solids into planar AABBs.
 solidWork=buildSolidSphere(RADIUS,{halfSize:128,minCell:1});
 report('terrain geometry','READY',terrain.leafCount+' fixed faces');
 report('octree solidity','BUILDING','Planet-wide permanent solidity');
}
registerTerrain();
function drawNearbyStatic(queryBox){
 while(aabbDisplay.children.length){
  const child=aabbDisplay.children[0];aabbDisplay.remove(child);child.geometry.dispose();
 }
 for(const entry of octree.query(queryBox,{kinds:['static']})){
  const {box}=entry,size=box.min.map((v,i)=>box.max[i]-v);
  const center=box.min.map((v,i)=>(v+box.max[i])/2);
  const lines=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(...size)),cyan);
  lines.position.set(...center);aabbDisplay.add(lines);
 }
}
async function initializePhysics(){
 try{
  physicsLoading=true;
  loadStatus('Initializing Box3D and registering solid terrain...');
  report('Box3D','LOADING');
  const world=await new PhysicsWorld().init();
  // The player is a dynamic capsule; the octree's AABB is only broad-phase occupancy.
  playerCollider=world.addPlayerCapsule(player);
  world.syncStatic(octree,boundsAt(player,26));
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
  world.syncStatic(octree,boundsAt(player,26));
  physics=world;fallingCubes=cubes;simulationReady=true;
  loading.remove();
  report('Box3D','READY',cubes.length+' dynamic bodies sharing world octree');
 }catch(error){loadStatus('Physics initialization failed: '+error.message);report('Box3D','FAILED',error.stack||error.message);}
}
report('octree solidity','WAITING','Terrain generation');
report('Box3D','WAITING','World octree');
let last=performance.now(),elapsed=0,frames=0,lastTerrain=0,resizeW=0,resizeH=0;
function frame(now){
 requestAnimationFrame(frame);
 try{
 const dt=Math.min(.05,(now-last)/1000);last=now;elapsed+=dt;frames++;
 if(innerWidth!==resizeW||innerHeight!==resizeH){resizeW=innerWidth;resizeH=innerHeight;renderer.setSize(resizeW,resizeH,false);camera.aspect=resizeW/resizeH;camera.updateProjectionMatrix();}
 const ex=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0)+moveX;
 const ey=(keys.has('w')||keys.has('arrowup')?1:0)-(keys.has('s')||keys.has('arrowdown')?1:0)+moveY;
 up=player.clone().normalize();east=new THREE.Vector3(0,1,0).cross(up).normalize();north=up.clone().cross(east).normalize();
 const facing=north.clone().multiplyScalar(Math.cos(yaw)).addScaledVector(east,Math.sin(yaw));
 const side=east.clone().multiplyScalar(Math.cos(yaw)).addScaledVector(north,-Math.sin(yaw));
 if(simulationReady&&physics&&playerCollider){
  const motion=facing.multiplyScalar(ey).addScaledVector(side,ex);
  if(motion.lengthSq()>1)motion.normalize();
  physics.movePlayer(playerCollider,motion,5,player.clone().normalize());
 }
 up=player.clone().normalize();east=new THREE.Vector3(0,1,0).cross(up).normalize();north=up.clone().cross(east).normalize();
 const aim=north.clone().multiplyScalar(Math.cos(yaw)).addScaledVector(east,Math.sin(yaw));
 const eye=player.clone().addScaledVector(up,2+zoom*Math.sin(pitch)).addScaledVector(aim,-zoom*Math.cos(pitch));
 camera.position.copy(eye);camera.up.copy(up);camera.lookAt(player.clone().addScaledVector(up,1));
 if(avatar){avatar.position.copy(player).addScaledVector(up,-1.1);avatar.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),up);}
 gravityArrow.position.copy(player).addScaledVector(up,3);gravityArrow.setDirection(up.clone().negate());
 // Build the entire planet once. All geometry is committed before physics starts.
 if(octree){
  try{
   if(!solidityReady){
    const deadline=performance.now()+3;
    if(solidWork){
     while(performance.now()<deadline){
      const result=solidWork.next();
      if(result.done){solidWork=null;break;}
      if(result.value)solidBoxes.push(result.value);
     }
     loadStatus('Building planet from solid core outward: '+solidBoxes.length+' occupied AABBs');
    }else if(!mergedSolids){
     loadStatus('Merging permanent solid AABBs...');
     mergedSolids=mergeSolidBoxes(solidBoxes);
     solidBoxes=[]; // Temporary build buffer only; completed geometry remains immutable.
    }else{
     while(solidInsertIndex<mergedSolids.length&&performance.now()<deadline){
      octree.insert('planet:'+solidInsertIndex,mergedSolids[solidInsertIndex],{kind:'static',shape:'box',owner:'planet'});
      solidInsertIndex++;
     }
     loadStatus('Installing permanent solidity: '+solidInsertIndex+'/'+mergedSolids.length+' AABBs');
     if(solidInsertIndex===mergedSolids.length){
      solidityReady=true;mergedSolids=null;
      report('octree solidity','READY',solidInsertIndex+' permanent merged AABBs');
     }
    }
   }
   if(solidityReady&&!simulationReady&&!physicsLoading)void initializePhysics();
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
    if(frames%30===1)physics.syncStatic(octree,activeCollisionAreas());
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
   if(solidityReady&&frames%60===1)drawNearbyStatic(boundsAt(player,8));
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
