import * as THREE from 'three';

// Every biome may provide its own texture and ranges; these are the Meadows defaults.
export const DEFAULT_GRASS_STYLE=Object.freeze({
 texture:'grass.svg',width:1,height:1.2,
 widthRange:[.75,1.25],heightRange:[.6,1.4],
 uvOffsetRange:[0,.12],uvTileRange:[.9,1.1],
 windAmplitude:.025,windSpeed:1.4
});
function seeded(id,salt){
 let h=2166136261;
 for(const c of String(id)+salt){h=Math.imul(h^c.charCodeAt(0),16777619);}
 h=Math.imul(h^(h>>>16),2246822507);h^=h>>>13;
 return (h>>>0)/4294967296;
}
const vary=(range,n)=>range[0]+(range[1]-range[0])*n;
export class GrassVisual {
 constructor(){this.materials=new Map();this.geometries=new Map();this.time=0;}
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
  const key=offset+':'+tile;
  if(!this.geometries.has(key)){
   const geometry=new THREE.PlaneGeometry(1,1,1,5);
   geometry.translate(0,.5,0);
   const uv=geometry.getAttribute('uv');
   for(let i=0;i<uv.count;i++)uv.setX(i,offset/32+uv.getX(i)*(.75+tile/32));
   this.geometries.set(key,geometry);
  }
  return this.geometries.get(key);
 }
 create(position,id,style={}){
  const settings={...DEFAULT_GRASS_STYLE,...style};
  const group=new THREE.Group();
  group.position.copy(position);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),position.clone().normalize());
  const blades=new THREE.Group();
  blades.rotation.y=seeded(id,'angle')*Math.PI*2;
  const width=settings.width*vary(settings.widthRange,seeded(id,'width'));
  const height=settings.height*vary(settings.heightRange,seeded(id,'height'));
  const offset=vary(settings.uvOffsetRange,seeded(id,'offset'));
  const tile=vary(settings.uvTileRange,seeded(id,'tile'));
  // Shared, quantized geometry avoids a new texture/material per resource.
  const geometry=this.geometry(Math.round(offset*32),Math.round((tile-.75)*32));
  const material=this.material(settings.texture);
  const mesh=new THREE.Mesh(geometry,material);
  const crossed=new THREE.Mesh(geometry,material);
  mesh.scale.set(width,height,1);crossed.scale.set(width,height,1);
  crossed.rotation.y=Math.PI/2;
  blades.add(mesh,crossed);group.add(blades);
  return {group,blades,mesh,
   windPhase:seeded(id,'wind')*Math.PI*2,
   windAmplitude:settings.windAmplitude,windSpeed:settings.windSpeed};
 }
 release(mesh){}
 update(dt,clumps){
  this.time+=dt;
  for(const c of clumps.values()){
   if(c.state==='standing'&&c.group.visible)
    c.blades.rotation.z=Math.sin(this.time*c.windSpeed+c.windPhase)*c.windAmplitude;
  }
 }
}
