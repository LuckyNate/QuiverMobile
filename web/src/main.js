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

// Box3D operates in an anchored local tangent frame (Y points away from the planet).
// The frame is fixed when spawned so bodies accumulate on the ground instead of
// following the player above their heads.
let physics=null,physicsGroup=null,fallingCubes=[],octree=null,playerCollider=null;
const dropOrigin=player.clone();
const dropUp=dropOrigin.clone().normalize();
const dropEast=new THREE.Vector3(0,1,0).cross(dropUp).normalize();
const dropNorth=dropUp.clone().cross(dropEast).normalize();
const dropBasis=new THREE.Matrix4().makeBasis(dropEast,dropUp,dropNorth);
const dropOrientation=new THREE.Quaternion().setFromRotationMatrix(dropBasis);
// The collision columns are sampled from the rendered planet itself.
// The octree contains occupied terrain volumes, not a separate platform.
// Box3D's local Y axis maps to the planet's outward radial direction.
function buildTerrainSolidity(){
 if(!terrain || !terrain.mesh.geometry.getAttribute('position')?.count)throw new Error('Terrain geometry not ready');
 terrain.mesh.updateMatrixWorld(true);
 const raycaster=new THREE.Raycaster();
 const down=dropUp.clone().negate();
 const origin=dropOrigin.clone();
 const tree=new StaticAabbOctree([0,-8,0],32,7);
 const tile=1, extent=8;
 let n=0;
 for(let ix=-extent;ix<extent;ix++)for(let iz=-extent;iz<extent;iz++){
  const x=ix*tile,z=iz*tile;
  // A cell cannot rise above any measured surface corner.
  let ground=Infinity,found=0;
  for(const dx of [0,1])for(const dz of [0,1]){
   const worldPoint=origin.clone().addScaledVector(dropEast,x+dx*tile).addScaledVector(dropNorth,z+dz*tile).addScaledVector(dropUp,8);
   raycaster.set(worldPoint,down);
   const hit=raycaster.intersectObject(terrain.mesh,false)[0];
   if(hit){ground=Math.min(ground,8-hit.distance);found++;}
  }
  if(!found)continue;
  // Slight inset avoids raising collision above the visible faceted terrain.
  const top=ground-.06;
  tree.insert({min:[x,-18,z],max:[x+tile,top,z+tile]},'terrain-'+(n++));
 }
 tree.compact();
 return tree;
}
function showSolidity(group,tree){
 const cyan=new THREE.LineBasicMaterial({color:0x00ffff,depthTest:true,depthWrite:false});
 for(const {box} of tree.sources){
  const size=box.min.map((v,i)=>box.max[i]-v);
  const center=box.min.map((v,i)=>(v+box.max[i])/2);
  const outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(...size)),cyan);
  outline.position.set(...center);group.add(outline);
 }
}
let solidityStarted=false;
async function initializePhysics(){
 try{
  report('octree solidity','LOADING');
  octree=buildTerrainSolidity();
  report('octree solidity','READY',octree.sources.length+' terrain AABBs');
  report('Box3D','LOADING');
  const world=await new PhysicsWorld().init();
  world.syncStatic(octree,{min:[-25,-22,-25],max:[25,10,25]});
  // Player collider in the same planet-local frame as the terrain.
  // Static collision shape stays independent of the visual GLB.
  playerCollider=world.world.createBody({type:'static',position:{x:0,y:.9,z:0}});
  playerCollider.createBox({halfExtents:{x:.35,y:.9,z:.35}});
  const group=new THREE.Group();
  group.position.copy(dropOrigin);
  group.quaternion.copy(dropOrientation);
  // Outline actual merged octree collision boxes in the same local frame.
  showSolidity(group,octree);
  const cubes=[];
  const cubeGeometry=new THREE.BoxGeometry(.8,.8,.8);
  const cubeMaterial=new THREE.MeshStandardMaterial({color:0xffa540,roughness:.8});
  // Twenty dynamic bodies; local -Y corresponds to planet-center gravity.
  for(let i=0;i<20;i++){
   const x=((i%5)-2)*1.15;
   const z=(Math.floor(i/5)-1.5)*1.15;
   const y=4+i*.85;
   const body=world.addDynamicBox([x,y,z],.4);
   const mesh=new THREE.Mesh(cubeGeometry,cubeMaterial);
   mesh.position.set(x,y,z);group.add(mesh);
   cubes.push({body,mesh});
  }
  scene.add(group);
  physics=world;physicsGroup=group;fallingCubes=cubes;
  report('Box3D','READY',cubes.length+' falling cubes on planet collision');
 }catch(error){report('Box3D','FAILED',error.stack||error.message);}
}
report('octree solidity','WAITING','Terrain generation');
report('Box3D','WAITING','Terrain solidity');
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
  try{
   terrain.rebuild(player,camera);report('terrain geometry','READY',terrain.leafCount+' leaves');
   if(!solidityStarted){solidityStarted=true;void initializePhysics();}
  }
  catch(error){report('terrain geometry','FAILED',error.message);terrain=null;}
  lastTerrain=now;
 }
 if(physics){
  try{
   // Update player collider in the fixed drop-site frame when the player moves.
   if(playerCollider && typeof playerCollider.setPosition==='function'){
    const delta=player.clone().sub(dropOrigin);
    playerCollider.setPosition({
     x:delta.dot(dropEast), y:.9+delta.dot(dropUp), z:delta.dot(dropNorth)
    });
   }
   physics.step(dt);
   for(const {body,mesh} of fallingCubes){
    const p=body.getPosition();
    mesh.position.set(p.x,p.y,p.z);
    if(typeof body.getRotation==='function'){
     const q=body.getRotation();
     if(q)mesh.quaternion.set(q.x,q.y,q.z,q.w);
    }
   }
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
