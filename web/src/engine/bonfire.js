import * as THREE from 'three';

const HOUR=3600000;
const MAX_FUEL=720*HOUR;
const PARTICLES=64;

// Permanent twelve-log camp bonfire, with a separate, persistent real-time fuel reserve.
export class Bonfire {
 constructor({scene,shared,player,playerId,camera,app}){
  Object.assign(this,{scene,shared,player,playerId,camera});
  this.recordId='camp:bonfire:'+playerId;
  this.root=new THREE.Group();
  this.logs=new THREE.Group();this.root.add(this.logs);
  const wood=new THREE.MeshStandardMaterial({color:0x745039,roughness:1});
  const cylinder=new THREE.CylinderGeometry(.16,.22,3.7,7);
  for(let i=0;i<12;i++){
   const angle=i*Math.PI/6;
   const mesh=new THREE.Mesh(cylinder,wood);
   const base=new THREE.Vector3(Math.sin(angle)*1.35,.22,Math.cos(angle)*1.35);
   const tip=new THREE.Vector3(0,3.35,0);
   mesh.position.copy(base).add(tip).multiplyScalar(.5);
   mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),tip.sub(base).normalize());
   this.logs.add(mesh);
  }
  const voxels=new THREE.BoxGeometry(.095,.095,.095);
  const colors=[0xff4c11,0xff8c1a,0xffc633,0xffed6b];
  this.fire=new THREE.InstancedMesh(voxels,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.93,depthWrite:false}),PARTICLES);
  this.fire.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  this.dummy=new THREE.Object3D();
  this.fire.frustumCulled=false;
  for(let i=0;i<PARTICLES;i++)this.fire.setColorAt(i,new THREE.Color(colors[i%colors.length]));
  this.root.add(this.fire);scene.add(this.root);
  this.button=document.createElement('button');this.button.type='button';this.button.textContent='Add Fuel';
  this.button.style.cssText='display:none;position:fixed;z-index:5;transform:translate(-50%,-50%);padding:9px 12px;background:#5b341c;color:#fff2d0;border:1px solid #df9b44;border-radius:6px;font:600 13px system-ui;touch-action:manipulation';
  this.info=document.createElement('div');this.info.style.cssText='font:11px system-ui;margin-top:3px';
  this.button.append(this.info);app.append(this.button);
  this.button.addEventListener('click',()=>this.addFuel());
  const saved=shared.getEntity(this.recordId);
  this.exists=Boolean(saved?.position);
  this.endAt=saved?.endAt||0;
  if(this.exists)this.positionAt(saved.position);
  else this.root.visible=false;
 }
 positionAt(position){
  this.root.position.fromArray(position);
  this.root.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),this.root.position.clone().normalize());
  this.root.visible=true;this.exists=true;
 }
 build(position){
  if(this.exists||this.shared.getEquippedTool(this.playerId)!=='hammer')return false;
  const inv=this.shared.getInventory(this.playerId);
  if((inv.logs||0)<12)return false;
  if(!this.shared.spendLogs(this.playerId,12))return false;
  this.positionAt(position.toArray());
  this.endAt=0;
  this.persist();
  return true;
 }
 persist(){this.shared.setEntity(this.recordId,{state:'standing',position:this.root.position.toArray(),endAt:this.endAt,ownerId:this.playerId});}
 addFuel(){
  if(!this.exists||this.player.position.distanceTo(this.root.position)>5)return false;
  const now=Date.now(),next=Math.max(now,this.endAt)+HOUR;
  if(next>now+MAX_FUEL)return false;
  if(!this.shared.spendLogs(this.playerId,1))return false;
  this.endAt=next;this.persist();return true;
 }
 update(time){
  if(!this.exists){this.button.style.display='none';return;}
  const now=Date.now(),burning=this.endAt>now;
  this.fire.visible=burning;
  if(burning){
   for(let i=0;i<PARTICLES;i++){
    const phase=((time*.75+i*.61803398875)%1);
    const angle=i*2.39996323;
    const radius=(.3+phase*.45)*Math.sqrt((i%17)/17);
    this.dummy.position.set(Math.cos(angle)*radius,.25+phase*2.8,Math.sin(angle)*radius);
    const size=(.65+((i*13)%11)/15)*(1-phase*.65);
    this.dummy.scale.setScalar(size);
    this.dummy.rotation.set(0,angle,0);
    this.dummy.updateMatrix();this.fire.setMatrixAt(i,this.dummy.matrix);
   }
   this.fire.instanceMatrix.needsUpdate=true;
  }
  const close=this.player.position.distanceTo(this.root.position)<5;
  const visible=close&&this.root.visible;
  const screen=this.root.position.clone().addScaledVector(this.root.position.clone().normalize(),2.1).project(this.camera);
  if(!visible||screen.z<0||screen.z>1||Math.abs(screen.x)>1||Math.abs(screen.y)>1){this.button.style.display='none';return;}
  this.button.style.display='block';
  this.button.style.left=((screen.x+1)*.5*window.innerWidth)+'px';
  this.button.style.top=((1-screen.y)*.5*window.innerHeight)+'px';
  const hours=Math.max(0,Math.ceil((this.endAt-now)/HOUR));
  const capacity=Math.max(now,this.endAt)+HOUR<=now+MAX_FUEL;
  this.info.textContent=hours+'/720 hours · '+(this.shared.getInventory(this.playerId).logs||0)+' logs';
  this.button.disabled=!capacity||!(this.shared.getInventory(this.playerId).logs>0);
 }
}
