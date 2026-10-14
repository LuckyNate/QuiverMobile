import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Resource} from './resource.js';
import {withinSceneryRange} from './scenery-visibility.js';
import {MEADOWS_GREEN_DYE} from './dye-palette.js';

// Meadows grass: one scythe touch yields five pooled quality-1 fibers.
// A shared material uses a GPU vertex sway, avoiding per-blade CPU animation.
export class TallGrass extends Resource {
 constructor({id,position}={}){
  super({id,type:'grass',position,requiredTool:'scythe',yieldType:'fibers',yieldCount:5});
  this.quality=1;
 }
}
// Normalize GLB and fallback coordinates so the attachment point is precisely
// the center of the grass footprint at its lowest vertex (local Y = 0).
function anchorGrassGeometry(source){
 const geometry=source.clone();
 geometry.computeBoundingBox();
 const {min,max}=geometry.boundingBox;
 geometry.translate(-(min.x+max.x)/2,-min.y,-(min.z+max.z)/2);
 geometry.computeBoundingBox();
 geometry.computeBoundingSphere();
 return geometry;
}
export class TallGrassField {
 constructor({root,shared,player,playerId,scene}){
  Object.assign(this,{root,shared,player,playerId,scene});
  this.clumps=new Map();this.time=0;this.ready=true;
  // Visible fallback while the GLB loads, and if an embedded WebView cannot load it.
  this.spriteGeometry=anchorGrassGeometry(new THREE.PlaneGeometry(.9,1.2,1,5));
  this.uniforms={windTime:{value:0}};
  const texture=new THREE.TextureLoader().load(import.meta.env.BASE_URL+'grass.png',undefined,undefined,error=>console.error('Grass texture unavailable',error));
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.magFilter=THREE.LinearFilter;
  texture.minFilter=THREE.LinearMipmapLinearFilter;
  this.material=new THREE.MeshStandardMaterial({map:texture,transparent:true,alphaTest:.35,
   side:THREE.DoubleSide,roughness:1,depthWrite:true});
  this.material.onBeforeCompile=shader=>{
   shader.uniforms.windTime=this.uniforms.windTime;
   shader.vertexShader=shader.vertexShader.replace('#include <common>',
    '#include <common>\nuniform float windTime;');
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
    '#include <begin_vertex>\ntransformed.x += pow(max(position.y,0.0),1.6)*0.12*sin(windTime*1.6+position.x*2.0+position.z*1.3);');
  };
  // The GLB contains the crossed sprite planes; one shared GPU material animates all instances.
  new GLTFLoader().load(import.meta.env.BASE_URL+'grass.glb',gltf=>{
   const sprite=gltf.scene.getObjectByName('GrassSprite')||gltf.scene.getObjectByProperty('isMesh',true);
   if(!sprite?.geometry){console.error('Grass GLB has no sprite mesh');return;}
   const old=this.spriteGeometry;
   this.spriteGeometry=anchorGrassGeometry(sprite.geometry);
   for(const clump of this.clumps.values())clump.blades.children[0].geometry=this.spriteGeometry;
   old.dispose();
  },undefined,error=>console.error('Unable to load grass GLB',error));
 }
 spawn(id,position){
  if(!this.ready||this.clumps.has(id))return false;
  const saved=this.shared?.getEntity(id);
  if(saved&&saved.state!=='standing')return false;
  const group=new THREE.Group();
  group.position.copy(position);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),position.clone().normalize());
  const blades=new THREE.Group();group.add(blades);
  blades.add(new THREE.Mesh(this.spriteGeometry,this.material));
  this.root.add(group);
  const resource=new TallGrass({id,position:position.toArray()});
  this.clumps.set(id,{id,position,group,blades,resource,state:'standing',progress:0,owner:null});
  return true;
 }
 unload(id){
  const c=this.clumps.get(id);if(!c)return;
  if(c.state==='falling'||c.state==='flying')return;
  this.root.remove(c.group);this.clumps.delete(id);
 }
 update(dt,body,tool){
  this.uniforms.windTime.value+=dt;
  const playerPosition=this.player.position;
  const avatar=body?.getPosition();
  for(const c of this.clumps.values()){
   const d=c.position.distanceTo(playerPosition);
   if(c.state==='standing'){
    c.group.visible=withinSceneryRange(c.position,playerPosition);
    if(tool!=='scythe'||!avatar||d>1.5)continue;
    const up=c.position.clone().normalize();
    const relative=new THREE.Vector3(avatar.x,avatar.y,avatar.z).sub(c.position);
    const altitude=relative.dot(up);
    const lateral=relative.addScaledVector(up,-altitude).length();
    if(lateral>1.05||altitude<-.6||altitude>2.3)continue;
    c.state='falling';c.resource.state='falling';c.owner=this.playerId;c.progress=0;
    this.shared?.setEntity(c.id,{state:'felled',ownerId:c.owner});
   }else if(c.state==='falling'){
    c.progress=Math.min(1,c.progress+dt/.38);
    c.blades.rotation.z=-Math.PI*.47*THREE.MathUtils.smoothstep(c.progress,0,1);
    if(c.progress>=1){c.state='flying';c.resource.state='flying';c.progress=0;}
   }else if(c.state==='flying'){
    const owner=this.shared?.getPlayer(c.owner);
    const destination=owner?.position||playerPosition;
    const target=new THREE.Vector3(destination.x,destination.y,destination.z);
    const diff=target.sub(c.group.position),distance=diff.length();
    c.group.position.addScaledVector(diff,Math.min(1,(8+Math.min(35,30-distance))*dt/Math.max(.001,distance)));
    c.group.scale.setScalar(Math.max(.05,Math.min(1,distance/6)));
    if(distance<.6){
     c.state='collected';c.resource.state='collected';this.root.remove(c.group);
     this.shared?.awardFibers(c.owner,5,1);
     const discovered=!(this.shared?.getUnlockedDyes(c.owner)||[]).includes(MEADOWS_GREEN_DYE);
     this.shared?.unlockDye(c.owner,MEADOWS_GREEN_DYE);
     this.shared?.setEntity(c.id,{state:'collected',ownerId:c.owner});
     if(discovered)this.onDiscovery?.();
    }
   }
  }
 }
}
