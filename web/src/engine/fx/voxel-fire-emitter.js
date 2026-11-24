import * as THREE from 'three';
import {BillboardParticles} from './billboard-particles.js';

// Reusable bonfire preset for the shared billboard particle system.
// Large fire and small drifting embers each render as one GPU batch.
export class VoxelFireEmitter {
 constructor({flames=420,embers=48,height=4.1,radius=1.15}={}){
  this.group=new THREE.Group();
  this.layers=[
   // Short, wide copy of the flame emitter for a dense combustion core.
   new BillboardParticles({
    count:Math.round(flames*1.45),size:.34,
    height:height*.42,radius:radius*1.55,
    palette:[0xff2e08,0xff650d,0xff9f11,0xffcf24,0xffe747,0xfff48c]
   }),
   new BillboardParticles({
    count:flames,size:.28,height,radius,
    palette:[0xff2e08,0xff650d,0xff9f11,0xffcf24,0xffe747,0xfff48c]
   }),
   new BillboardParticles({
    count:embers,size:.12,height,radius,embers:true,
    palette:[0xff7d12,0xffb92b,0xffdc56,0xffe98d]
   })
  ];
  for(const layer of this.layers)this.group.add(layer.mesh);
  this.enabled=false;this.group.visible=false;
 }
 setEnabled(enabled){
  this.enabled=Boolean(enabled);
  this.group.visible=this.enabled;
 }
 update(time){
  if(!this.enabled)return;
  for(const layer of this.layers)layer.update(time);
 }
 dispose(){for(const layer of this.layers)layer.dispose();}
}
