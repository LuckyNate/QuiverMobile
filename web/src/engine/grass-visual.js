import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Biome-defined appearance with deterministic variation per resource.
export const DEFAULT_GRASS_STYLE=Object.freeze({
 texture:'grass.svg',width:1,height:1.2,
 widthRange:[.75,1.25],heightRange:[.6,1.4],
 uvOffsetRange:[0,.12],uvTileRange:[.9,1.1],
 windAmplitude:.025,windSpeed:1.4
});
function seeded(id,salt){
 let h=2166136261;
 for(const c of String(id)+salt)h=Math.imul(h^c.charCodeAt(0),16777619);
 h=Math.imul(h^(h>>>16),2246822507);h^=h>>>13;
 return (h>>>0)/4294967296;
}
const vary=(range,n)=>range[0]+(range[1]-range[0])*n;

// Standing clumps share instanced crossed-plane meshes. Only harvested grass
// temporarily becomes a separate mesh for its falling/collection animation.
export class GrassVisual {
 constructor(root){
  this.root=root;this.time=0;this.materials=new Map();this.geometries=new Map();
  this.batches=new Map();this.dummy=new THREE.Object3D();
  this.yaw=new THREE.Quaternion();this.lean=new THREE.Quaternion();
  this.yAxis=new THREE.Vector3(0,1,0);this.zAxis=new THREE.Vector3(0,0,1);
 }
 material(texturePath){
  if(!this.materials.has(texturePath)){
   const texture=new THREE.TextureLoader().load(import.meta.env.BASE_URL+texturePath);
   texture.colorSpace=THREE.SRGBColorSpace;
   this.materials.set(texturePath,new THREE.MeshBasicMaterial({
    map:texture,side:THREE.DoubleSide,transparent:true,alphaTest:.25,depthWrite:true
   }));
  }
  return this.materials.get(texturePath);
 }
 geometry(offset,tile){
  // Nine shared UV variants preserve texture variation without a draw call per clump.
  const key=offset+':'+tile;
  if(!this.geometries.has(key)){
   const base=new THREE.PlaneGeometry(1,1,1,5);
   base.translate(0,.5,0);
   const uv=base.getAttribute('uv');
   const shift=offset*.06,scale=.9+tile*.1;
   for(let i=0;i<uv.count;i++)uv.setX(i,shift+uv.getX(i)*scale);
   const cross=base.clone();cross.rotateY(Math.PI/2);
   const merged=mergeGeometries([base,cross],false);
   base.dispose();cross.dispose();
   this.geometries.set(key,merged);
  }
  return this.geometries.get(key);
 }
 batch(key,geometry,material){
  let batches=this.batches.get(key);
  if(!batches){batches=[];this.batches.set(key,batches);}
  let batch=batches.find(b=>b.entries.length<b.capacity);
  if(batch)return batch;
  const capacity=batches.length?Math.min(4096,batches[batches.length-1].capacity*2):128;
  const mesh=new THREE.InstancedMesh(geometry,material,capacity);
  mesh.count=0;mesh.frustumCulled=false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  this.root.add(mesh);
  batch={mesh,entries:[],capacity};
  batches.push(batch);
  return batch;
 }
 create(position,id,style={}){
  const settings={...DEFAULT_GRASS_STYLE,...style};
  const width=settings.width*vary(settings.widthRange,seeded(id,'width'));
  const height=settings.height*vary(settings.heightRange,seeded(id,'height'));
  const offset=Math.min(2,Math.floor(seeded(id,'offset')*3));
  const tile=Math.min(2,Math.floor(seeded(id,'tile')*3));
  const geometry=this.geometry(offset,tile),material=this.material(settings.texture);
  const key=settings.texture+':'+offset+':'+tile;
  const batch=this.batch(key,geometry,material);
  const entry={
   id,position:position.clone(),up:new THREE.Quaternion().setFromUnitVectors(this.yAxis,position.clone().normalize()),
   angle:seeded(id,'angle')*Math.PI*2,width,height,geometry,material,batch,
   windPhase:seeded(id,'wind')*Math.PI*2,
   windAmplitude:settings.windAmplitude,windSpeed:settings.windSpeed,
   group:{visible:true},blades:null,mesh:null
  };
  entry.index=batch.entries.length;
  batch.entries.push(entry);batch.mesh.count=batch.entries.length;
  this.transform(entry,0);
  return entry;
 }
 transform(entry,lean){
  const dummy=this.dummy;
  dummy.position.copy(entry.position);
  this.yaw.setFromAxisAngle(this.yAxis,entry.angle);
  this.lean.setFromAxisAngle(this.zAxis,lean);
  dummy.quaternion.copy(entry.up).multiply(this.yaw).multiply(this.lean);
  const size=entry.group.visible?1:0;
  dummy.scale.set(entry.width*size,entry.height*size,size);
  dummy.updateMatrix();
  entry.batch.mesh.setMatrixAt(entry.index,dummy.matrix);
  entry.batch.mesh.instanceMatrix.needsUpdate=true;
 }
 detach(entry){
  const batch=entry.batch;
  if(!batch)return;
  const last=batch.entries.pop();
  if(last!==entry){batch.entries[entry.index]=last;last.index=entry.index;}
  batch.mesh.count=batch.entries.length;
  entry.batch=null;
  const group=new THREE.Group();
  group.position.copy(entry.position);group.quaternion.copy(entry.up);
  const blades=new THREE.Group();blades.rotation.y=entry.angle;
  const mesh=new THREE.Mesh(entry.geometry,entry.material);
  mesh.scale.set(entry.width,entry.height,1);
  blades.add(mesh);group.add(blades);this.root.add(group);
  entry.group=group;entry.blades=blades;entry.mesh=mesh;
 }
 release(entry){
  if(entry.batch){
   const batch=entry.batch,last=batch.entries.pop();
   if(last!==entry){batch.entries[entry.index]=last;last.index=entry.index;}
   batch.mesh.count=batch.entries.length;
   entry.batch=null;
  }else if(entry.blades){
   this.root.remove(entry.group);
   entry.group.clear();
  }
 }
 update(dt,clumps){
  this.time+=dt;
  for(const c of clumps.values()){
   if(c.state!=='standing'||!c.batch)continue;
   this.transform(c,Math.sin(this.time*c.windSpeed+c.windPhase)*c.windAmplitude);
  }
 }
}
