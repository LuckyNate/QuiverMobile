import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {WorldTerrain,RADIUS} from './world.js';
import {WorldOctree} from './engine/world-octree.js';
import {ImplicitSphere} from './engine/implicit-sphere.js';
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
 if(e.pointerId===lookPointer){yaw+=dx*.007;pitch=THREE.MathUtils.clamp(pitch+dy*.007,-.1,1.45);}
 else{moveX=THREE.MathUtils.clamp((e.clientX-p.startX)/90,-1,1);moveY=THREE.MathUtils.clamp((p.startY-e.clientY)/90,-1,1);}
});
function release(e){touches.delete(e.pointerId);if(lookPointer===e.pointerId)lookPointer=null;if(![...touches].some(([id,p])=>id!==lookPointer)){moveX=0;moveY=0;}}
canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=THREE.MathUtils.clamp(zoom*Math.exp(e.deltaY*.001),3,30000);},{passive:false});
const gravityArrow=new THREE.ArrowHelper(new THREE.Vector3(0,0,-1),player,6,0xff00ff,1.2,.7);scene.add(gravityArrow);
wireBtn.addEventListener('click',()=>{gravityArrow.visible=!gravityArrow.visible;wireBtn.textContent='Gravity: '+(gravityArrow.visible?'ON':'OFF');});

// Permanent mathematical solidity is independent of rendered terrain triangles.
let physics=null,fallingCubes=[],octree=null,playerCollider=null;
let solidity=null,physicsLoading=false,simulationReady=false;
const cyan=new THREE.LineBasicMaterial({color:0x00ffff,depthTest:true,depthWrite:false});
const aabbDisplay=new THREE.Group();scene.add(aabbDisplay);
const footShadow=new THREE.Mesh(
 new THREE.CircleGeometry(.4,32),
 new THREE.MeshBasicMaterial({color:0x182432,transparent:true,opacity:.45,depthWrite:false,side:THREE.DoubleSide})
);
scene.add(footShadow);
function boundsAt(p,half){return {min:[p.x-half,p.y-half,p.z-half],max:[p.x+half,p.y+half,p.z+half]};}
// Flat 0.8 m footing samples multiple AABB tops along the local gravity
// normal. This avoids an overlapping compound hull that could jam Box3D.
const FOOT_RADIUS=.4,FOOT_OFFSET=.9,MAX_STEP=1;
// Blend terrain support normals over the entire circular sled footprint.
// Gravity remains independent and always points along the magenta radial arrow.
const FOOT_RADIUS=.4,FOOT_OFFSET=.925,MAX_STEP=1;
const footNormal=new THREE.Vector3(0,0,1);
function footingSurface(position,heading,gravityUp){
 const lateral=new THREE.Vector3().crossVectors(gravityUp,heading).normalize();
 if(lateral.lengthSq()<.01)return {normal:gravityUp.clone(),rise:0};
 const ahead=position.clone().addScaledVector(heading,.22);
 const cells=solidity.query(boundsAt(ahead,1.7),{kinds:['static']});
 const offsets=[[0,0],[.36,0],[-.36,0],[0,.36],[0,-.36],[.25,.25],[.25,-.25],[-.25,.25],[-.25,-.25]];
 const avg=new THREE.Vector3(),origin=new THREE.Vector3();
 let maxRise=0,hits=0;
 for(const [f,r] of offsets){
  origin.copy(ahead).addScaledVector(heading,f).addScaledVector(lateral,r)
   .addScaledVector(gravityUp,1.08-FOOT_OFFSET);
  let nearest=Infinity,hitAxis=-1,hitSign=0;
  for(const {box} of cells){
   let enter=0,exit=2.5,axisHit=-1,sign=0;
   for(let axis=0;axis<3;axis++){
    const d=-gravityUp.getComponent(axis),v=origin.getComponent(axis);
    if(Math.abs(d)<1e-8){
     if(v<box.min[axis]||v>box.max[axis]){enter=Infinity;break;}
    }else{
     const t1=(box.min[axis]-v)/d,t2=(box.max[axis]-v)/d;
     const first=Math.min(t1,t2),last=Math.max(t1,t2);
     if(first>enter){enter=first;axisHit=axis;sign=t1<t2?-1:1;}
     exit=Math.min(exit,last);
     if(exit<enter)break;
    }
   }
   if(enter<=exit&&enter<nearest&&axisHit>=0){nearest=enter;hitAxis=axis;hitSign=sign;}
  }
  if(hitAxis<0)continue;
  const rise=1.08-nearest;
  if(rise>MAX_STEP+.005)return {normal:gravityUp.clone(),rise:0,blocked:true};
  maxRise=Math.max(maxRise,rise);
  const surface=new THREE.Vector3().setComponent(hitAxis,hitSign);
  if(surface.dot(gravityUp)>0){avg.add(surface);hits++;}
 }
 if(!hits)return {normal:gravityUp.clone(),rise:0};
 avg.normalize();
 // Prevent isolated vertical contact from turning the footing into a wall.
 if(avg.dot(gravityUp)<.3)avg.lerp(gravityUp,.7).normalize();
 return {normal:avg,rise:Math.max(0,maxRise)};
}
function activeCollisionAreas(){
 const areas=[boundsAt(player,2)];
 for(const item of fallingCubes){
  const p=item.body.getPosition();
  areas.push(boundsAt(p,3));
 }
 return areas;
}
function registerTerrain(){
 if(!terrain)throw new Error('Terrain geometry unavailable');
 octree=new WorldOctree({center:[0,0,0],halfSize:256,maxDepth:9});
 octree.insert('player',boundsAt(player,.95),{kind:'player',owner:'player'});
 // Permanent mathematical solid, stored as a radius and an implicit octree.
 // Only queried cells materialize as temporary collision candidates.
 solidity=new ImplicitSphere(RADIUS,{halfSize:128,minCell:.25});
 report('terrain geometry','READY',terrain.leafCount+' fixed faces');
 report('octree solidity','READY','Implicit 25 cm spherical octree');

}
registerTerrain();
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
  playerCollider=world.addPlayerCapsule(player);
  world.syncStatic(solidity,boundsAt(player,2));
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
  world.syncStatic(solidity,activeCollisionAreas());
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
 const ex=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0)+moveX;
 const ey=(keys.has('w')||keys.has('arrowup')?1:0)-(keys.has('s')||keys.has('arrowdown')?1:0)+moveY;
 up=player.clone().normalize();east=new THREE.Vector3(0,1,0).cross(up).normalize();north=up.clone().cross(east).normalize();
 const facing=north.clone().multiplyScalar(Math.cos(yaw)).addScaledVector(east,Math.sin(yaw));
 const side=east.clone().multiplyScalar(Math.cos(yaw)).addScaledVector(north,-Math.sin(yaw));
 if(simulationReady&&physics&&playerCollider){
  const motion=facing.multiplyScalar(ey).addScaledVector(side,ex);
  if(motion.lengthSq()>1)motion.normalize();
  const radialUp=player.clone().normalize();
  const support=footingSurface(player,motion.lengthSq()>.001?motion.clone().normalize():facing.clone().normalize(),radialUp);
  footNormal.lerp(support.normal,.18).normalize();
  // Sled movement is tangent to distributed support, not directly into
  // a vertical AABB face. Gravity stays radial.
  const slide=motion.addScaledVector(footNormal,-motion.dot(footNormal));
  if(slide.lengthSq()>1)slide.normalize();
  physics.movePlayer(playerCollider,slide,5,radialUp);
  if(slide.lengthSq()>.001&&support.rise>.02&&!support.blocked){
   const v=playerCollider.getLinearVelocity();
   const radial=v.x*radialUp.x+v.y*radialUp.y+v.z*radialUp.z;
   const climb=Math.min(3.5,support.rise*7);
   if(radial<climb){
    const lift=climb-radial;
    playerCollider.setLinearVelocity({x:v.x+radialUp.x*lift,y:v.y+radialUp.y*lift,z:v.z+radialUp.z*lift});
   }
  }
 }
 up=player.clone().normalize();east=new THREE.Vector3(0,1,0).cross(up).normalize();north=up.clone().cross(east).normalize();
 const aim=north.clone().multiplyScalar(Math.cos(yaw)).addScaledVector(east,Math.sin(yaw));
 const eye=player.clone().addScaledVector(up,2+zoom*Math.sin(pitch)).addScaledVector(aim,-zoom*Math.cos(pitch));
 camera.position.copy(eye);camera.up.copy(up);camera.lookAt(player.clone().addScaledVector(up,1));
 if(avatar){avatar.position.copy(player).addScaledVector(up,-1.1);avatar.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),up);}
 footShadow.position.copy(player).addScaledVector(footNormal,-FOOT_OFFSET);
 footShadow.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),footNormal);
 gravityArrow.position.copy(player).addScaledVector(up,3);gravityArrow.setDirection(up.clone().negate());
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
    physics.syncStatic(solidity,activeCollisionAreas());
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
   drawNearbyStatic(boundsAt(player,2));
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
