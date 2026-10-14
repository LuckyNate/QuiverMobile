import * as THREE from 'three';

// Reusable, allocation-free-per-frame voxel flame emitter. One draw call per layer.
// Instance colors belong to the instanced mesh: do not enable vertexColors on the material.
export class VoxelFireEmitter {
 constructor({flames=420,embers=48,height=4.1,radius=1.15}={}){
  this.group=new THREE.Group();
  this.height=height;this.radius=radius;
  this.dummy=new THREE.Object3D();
  this.layers=[
   this.makeLayer(flames,.19,[0xff2e08,0xff650d,0xff9f11,0xffcf24,0xffe747,0xfff48c]),
   this.makeLayer(embers,.09,[0xff7d12,0xffb92b,0xffdc56,0xffe98d])
  ];
  this.group.add(...this.layers.map(layer=>layer.mesh));
  this.enabled=false;
  this.group.visible=false;
 }
 makeLayer(count,size,palette){
  const mesh=new THREE.InstancedMesh(
   new THREE.BoxGeometry(size,size,size),
   new THREE.MeshBasicMaterial({color:0xffffff,transparent:false,depthWrite:true}),
   count
  );
  mesh.frustumCulled=false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const items=[];
  for(let i=0;i<count;i++){
   const seed=this.hash(i+count*7);
   const angle=this.hash(i*3+19)*Math.PI*2;
   const radial=Math.sqrt(this.hash(i*7+31));
   const lifetime=this.hash(i*11+47);
   items.push({seed,angle,radial,lifetime});
   mesh.setColorAt(i,new THREE.Color(palette[Math.floor(this.hash(i*13+97)*palette.length)]));
  }
  return {mesh,items,count,embers:size<.1};
 }
 hash(n){
  let x=Math.imul(n^0x9e3779b9,0x85ebca6b);
  x=Math.imul(x^(x>>>13),0xc2b2ae35);
  return ((x^(x>>>16))>>>0)/4294967296;
 }
 setEnabled(enabled){
  this.enabled=Boolean(enabled);
  this.group.visible=this.enabled;
 }
 update(time){
  if(!this.enabled)return;
  for(const layer of this.layers){
   for(let i=0;i<layer.count;i++){
    const particle=layer.items[i];
    const speed=layer.embers?.27:.68;
    const life=(time*speed+particle.lifetime)%1;
    const height=layer.embers?this.height*(.7+life*1.05):.22+this.height*life;
    const taper=layer.embers?(1+life*.7):Math.pow(1-life,.8);
    const radial=this.radius*particle.radial*(layer.embers?.72:.12+.88*taper);
    // Independent seeded positions, with coherent turbulence rather than a helix.
    const twist=Math.sin(time*1.7+particle.seed*12+life*8)*.16+
      Math.sin(time*.83+height*2.1)*.11;
    const x=Math.cos(particle.angle)*radial+twist;
    const z=Math.sin(particle.angle)*radial+
      Math.cos(time*1.27+particle.seed*9+life*6)*.17;
    this.dummy.position.set(x,height,z);
    const pulse=.8+.35*Math.sin(time*8+particle.seed*31);
    const fade=layer.embers?(.45+.55*(1-life)):(.3+.7*Math.sin(Math.PI*Math.pow(life,.7)));
    this.dummy.scale.setScalar(Math.max(.08,pulse*fade));
    this.dummy.rotation.set(0,0,0);
    this.dummy.updateMatrix();
    layer.mesh.setMatrixAt(i,this.dummy.matrix);
   }
   layer.mesh.instanceMatrix.needsUpdate=true;
  }
 }
 dispose(){
  for(const layer of this.layers){
   layer.mesh.geometry.dispose();
   layer.mesh.material.dispose();
  }
 }
}
