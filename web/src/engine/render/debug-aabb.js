import * as THREE from 'three';

// Cyan debug wireframes for the static octree cells near the player.
// One reusable line buffer: current nearby AABB edges are written every frame.
export class DebugAabb {
 constructor(scene){
  this.material=new THREE.LineBasicMaterial({color:0x00ffff,depthTest:true,depthWrite:false});
  this.geometry=new THREE.BufferGeometry();
  this.positions=new Float32Array(0);
  this.edges=[[0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7]];
  this.mesh=new THREE.LineSegments(this.geometry,this.material);
  this.mesh.frustumCulled=false;
  this.group=new THREE.Group();
  this.group.add(this.mesh);
  this.group.visible=false;
  this.requested=false;
  scene.add(this.group);
 }
 setEnabled(visible){this.group.visible=Boolean(visible&&this.requested);}
 draw(solidity,queryBox){
  const entries=solidity.query(queryBox,{kinds:['static']});
  const needed=entries.length*this.edges.length*6;
  if(this.positions.length<needed){
   let capacity=Math.max(needed,this.positions.length*2,1536);
   this.positions=new Float32Array(capacity);
   this.geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));
  }
  let index=0;
  for(const {box} of entries){
   const x=box.min[0],y=box.min[1],z=box.min[2],X=box.max[0],Y=box.max[1],Z=box.max[2];
   const corners=[[x,y,z],[X,y,z],[x,Y,z],[X,Y,z],[x,y,Z],[X,y,Z],[x,Y,Z],[X,Y,Z]];
   for(const [a,b] of this.edges){
    const from=corners[a],to=corners[b];
    this.positions[index++]=from[0];this.positions[index++]=from[1];this.positions[index++]=from[2];
    this.positions[index++]=to[0];this.positions[index++]=to[1];this.positions[index++]=to[2];
   }
  }
  this.geometry.setDrawRange(0,index/3);
  if(index)this.geometry.attributes.position.needsUpdate=true;
 }
}
