import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {WorldTerrain,RADIUS} from './world.js';
import {WorldOctree} from './engine/world-octree.js';
import {classifyTerrainVolumes} from './engine/terrain-occupancy.js';
import {PhysicsWorld} from './physics.js';

const app=document.getElementById('app');
const bootstrap=document.getElementById('bootstrap');
if(bootstrap)bootstrap.remove();
const ui=document.createElement('div');
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
let player=up.clone().multiplyScalar(RADIUS),yaw=0,pitch=.35,zoom=8,moveX=0,moveY=0;
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

// Unified world-space partition: terrain triangles, player and all cubes.
let physics=null,fallingCubes=[],octree=null,playerCollider=null,solidityStarted=false,solidAnchor=null;
let terrainIds=[];
const cyan=new THREE.LineBasicMaterial({color:0x00ffff,depthTest:true,depthWrite:false});
const aabbDisplay=new THREE.Group();scene.add(aabbDisplay);
function boundsAt(p,half){return {min:[p.x-half,p.y-half,p.z-half],max:[p.x+half,p.y+half,p.z+half]};}
function rebuildSolidGround(anchor=player){
 if(!octree||!terrain)return;
 for(const id of terrainIds)octree.remove(id);
 terrainIds=[];
 const data=terrain.mesh.geometry.getAttribute('position').array;
 // Local AABB octree occupancy, world-aligned, from the SAME visible terrain.
 const center=anchor.toArray().map(v=>Math.round(v/8)*8);
 const boxes=classifyTerrainVolumes(data,center,{halfSize:16,maxDepth:7});
 for(let i=0;i<boxes.length;i++){
  const id='ground-'+i;octree.insert(id,boxes[i],{kind:'static',shape:'box',owner:'planet'});
  terrainIds.push(id);
 }
 solidAnchor=anchor.clone();
 report('octree solidity','READY',terrainIds.length+' occupied AABBs');
}
function registerTerrain(){
 if(!terrain)throw new Error('Terrain geometry unavailable');
 const next=new WorldOctree({center:[0,0,0],halfSize:Math.max(256,RADIUS*2),maxDepth:9});
 next.insert('player',boundsAt(player.clone().addScaledVector(player.clone().normalize(),.9),.9),{kind:'player',owner:'player'});
 octree=next;
 rebuildSolidGround(player);
 return next;
}
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
  report('octree solidity','LOADING');
  octree=registerTerrain();
  report('octree solidity','READY',terrainIds.length+' occupied AABBs');
  report('Box3D','LOADING');
  const world=await new PhysicsWorld().init();
  // The player occupies the same octree and a static Box3D contact shape.
  const colliderPosition=player.clone().addScaledVector(player.clone().normalize(),.9);
  playerCollider=world.world.createBody({type:'static',position:{x:colliderPosition.x,y:colliderPosition.y,z:colliderPosition.z}});
  playerCollider.createBox({halfExtents:{x:.35,y:.9,z:.35},friction:.7});
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
  world.syncStatic(octree,boundsAt(player,24));
  physics=world;fallingCubes=cubes;
  report('Box3D','READY',cubes.length+' dynamic bodies sharing world octree');
 }catch(error){report('Box3D','FAILED',error.stack||error.message);}
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
 if(ex||ey){const motion=facing.multiplyScalar(ey).addScaledVector(side,ex);if(motion.lengthSq()>1)motion.normalize();player=player.clone().addScaledVector(motion,5*dt).normalize().multiplyScalar(RADIUS);}
 up=player.clone().normalize();east=new THREE.Vector3(0,1,0).cross(up).normalize();north=up.clone().cross(east).normalize();
 const aim=north.clone().multiplyScalar(Math.cos(yaw)).addScaledVector(east,Math.sin(yaw));
 const eye=player.clone().addScaledVector(up,2+zoom*Math.sin(pitch)).addScaledVector(aim,-zoom*Math.cos(pitch));
 camera.position.copy(eye);camera.up.copy(up);camera.lookAt(player.clone().addScaledVector(up,1));
 if(avatar){avatar.position.copy(player);avatar.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),up);}
 gravityArrow.position.copy(player).addScaledVector(up,3);gravityArrow.setDirection(up.clone().negate());
 // Only change terrain selection when position/zoom changes significantly.
 if(terrain&&now-lastTerrain>650){
  try{
   terrain.rebuild(player,camera);terrain.edges.visible=false;report('terrain geometry','READY',terrain.leafCount+' leaves');
   if(octree&&solidAnchor&&player.distanceTo(solidAnchor)>7)rebuildSolidGround(player);
   if(!solidityStarted){solidityStarted=true;void initializePhysics();}
  }
  catch(error){report('terrain geometry','FAILED',error.message);terrain=null;}
  lastTerrain=now;
 }
 if(octree){
  try{
   const up=player.clone().normalize();
   octree.update('player',boundsAt(player.clone().addScaledVector(up,.9),.9));
   if(physics){
    // World-space radial gravity; the frame never rotates independently.
    physics.setPlanetGravity(player);
    const near=boundsAt(player,24);
    for(const item of fallingCubes){
     const p=item.body.getPosition();
     const v=new THREE.Vector3(p.x,p.y,p.z);
     octree.update(item.id,boundsAt(v,.4));
    }
    if(frames%30===1)physics.syncStatic(octree,near);
    physics.step(dt);
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
   if(frames%60===1)drawNearbyStatic(boundsAt(player,8));
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
