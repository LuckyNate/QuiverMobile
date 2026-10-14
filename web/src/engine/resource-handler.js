import * as THREE from 'three';
import {TreeHarvestSystem} from '../trees.js';
import {Biome} from './biome.js';
import {BiomeResourceZone} from './biome-resource-zone.js';
import {ResourceDensity} from './resource-density.js';
import {ResourceDistributor} from './resource-distributor.js';

// Biomes request resources near the avatar. This owns the live resource bridge;
// TreeHarvestSystem keeps its existing visuals, contact, collection and Box3D adapter.
export class ResourceHandler extends TreeHarvestSystem {
 constructor(scene,player,height,radius,{terrain,shared=null,playerId='local-owner',camera=null,biomeProfiles={}}={}){
  super(scene,player,height,radius,{shared,playerId,camera,autoPopulate:false});
  if(!terrain?.roots?.length)throw new Error('ResourceHandler requires read-only D20 biome roots');
  this.chunks=[]; // Disable the old four-cell Meadows-only population loop.
  this.entryById=new Map();
  this.zones=terrain.roots.map(root=>{
   const id=Number(root.address.slice(1,3));
   const biome=new Biome({id,name:'Biome '+id,resourceDensity:biomeProfiles[id]||{tree:4500}});
   return new BiomeResourceZone({biome,root,radius,height,host:this,
    distributor:new ResourceDistributor(new ResourceDensity({
     seed:shared?.seed||'QuiverGL',
     profiles:{['F'+String(id).padStart(2,'0')]:biome.resourceDensity}
    }))});
  });
  const startFace=this.zones.find(zone=>zone.contains(player.position.clone().normalize()));
  if(startFace)startFace.biome.name='Meadows';
 }
 spawnTree(id,position,chunk){
  if(this.entryById.has(id))return false;
  const record=this.shared?.getEntity(id);
  if(record&&record.state!=='standing')return false;
  const entry=this.makeTree(chunk,0,position,id);
  this.entryById.set(id,entry);
  return true;
 }
 findTree(id){return this.entryById.get(id)||null;}
 unloadTree(id){
  const entry=this.entryById.get(id);
  if(!entry)return;
  if(entry.state==='falling'||entry.state==='fading'||entry.state==='flying')return;
  this.entryById.delete(id);
  this.objects.despawn(id);
  this.trees.splice(this.trees.indexOf(entry),1);
  this.root.remove(entry.tree);
  entry.trunk.geometry.dispose();
  entry.foliage.geometry.dispose();
  entry.foliage.material.dispose();
 }
 update(dt,body=null){
  // Each biome schedules its own nearby cells, regardless of render LOD.
  for(const zone of this.zones)zone.update(this.player.position);
  super.update(dt,body);
 }
}
