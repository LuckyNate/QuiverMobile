import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {WorldTerrain,RADIUS} from './world.js';
import {StaticAabbOctree} from './solidity.js';
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
const wireBtn=document.createElement('button');wireBtn.textContent='Wireframe: ON';wireBtn.style.cssText='font-size:14px;padding:10px';
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
wireBtn.addEventListener('click',()=>{if(!terrain)return;terrain.edges.visible=!terrain.edges.visible;wireBtn.textContent='Wireframe: '+(terrain.edges.visible?'ON':'OFF');});

let physics=null,testBody=null,testCube=null,physicsGroup=null,octree=null;
try{
 octree=new StaticAabbOctree([0,0,0],256,8);
 octree.insert({min:[-12,-1,-12],max:[0,0,12]},'debug-ground-left');
 octree.insert({min:[0,-1,-12],max:[12,0,12]},'debug-ground-right');
 octree.compact();report('octree solidity','READY',octree.sources.length+' boxes');
}catch(error){report('octree solidity','FAILED',error.message);}
async function initializePhysics(){
 if(!octree){report('Box3D','SKIPPED','No octree');return;}
 try{
  report('Box3D','LOADING');
  const world=await new PhysicsWorld().init();
  world.syncStatic(octree,{min:[-20,-5,-20],max:[20,5,20]});
  const body=world.addDynamicBox([2,5,0],.4);
  const cube=new THREE.Mesh(new THREE.BoxGeometry(.8,.8,.8),new THREE.MeshStandardMaterial({color:0xffa540}));
  const platform=new THREE.Mesh(new THREE.BoxGeometry(24,1,24),new THREE.MeshStandardMaterial({color:0x5e666e,transparent:true,opacity:.28}));
  const group=new THREE.Group();group.add(cube,platform);scene.add(group);platform.position.y=-.5;
  physics=world;testBody=body;testCube=cube;physicsGroup=group;
  report('Box3D','READY');
 }catch(error){report('Box3D','FAILED',error.stack||error.message);}
}
void initializePhysics();
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
 // Only change terrain selection when position/zoom changes significantly.
 if(terrain&&now-lastTerrain>650){
  try{terrain.rebuild(player,camera);report('terrain geometry','READY',terrain.leafCount+' leaves');}
  catch(error){report('terrain geometry','FAILED',error.message);terrain=null;}
  lastTerrain=now;
 }
 if(physics&&testBody){
  try{
   physics.step(dt);
   const p=testBody.getPosition();
   physicsGroup.position.copy(player).addScaledVector(up,4).addScaledVector(east,4);
   physicsGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),up);
   testCube.position.set(p.x,p.y,p.z);
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
