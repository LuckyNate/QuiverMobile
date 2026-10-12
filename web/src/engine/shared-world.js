// Host-owned save record; peers will exchange snapshots/events when networking is added.
// Simulation and rendering remain local. No server or transport is instantiated here.
export class SharedWorld {
 constructor({ownerId='local-owner',seed='QuiverGL',storage=globalThis.localStorage}={}){
  this.ownerId=ownerId;this.seed=seed;this.storage=storage;
  this.saveKey='quiver-world:'+ownerId+':'+seed;
  this.players=new Map();this.entities=new Map();this.inventories=new Map();this.events=[];
  this.version=0;
  try{
   const saved=JSON.parse(storage?.getItem(this.saveKey)||'null');
   if(saved?.ownerId===ownerId&&saved.seed===seed){
    this.version=saved.version||0;
    for(const [id,state] of saved.entities||[])this.entities.set(id,state);
    for(const [id,items] of saved.inventories||[])this.inventories.set(id,items);
   }
  }catch{}
 }
 join(id,position){this.players.set(id,{id,position,logs:this.inventories.get(id)?.logs||0});}
 leave(id){this.players.delete(id);}
 getPlayer(id){return this.players.get(id);}
 updatePlayer(id,position){const p=this.players.get(id);if(p)p.position=position;}
 getEntity(id){return this.entities.get(id);}
 setEntity(id,state){
  const record={...state,id};
  this.entities.set(id,record);
  this.events.push({version:++this.version,type:'entity',id,state:record});
  if(this.events.length>256)this.events.shift();
  this.save();
 }
 awardLog(id,count=1){
  const p=this.players.get(id);
  if(!p)return false;
  p.logs=(p.logs||0)+count;
  this.inventories.set(id,{logs:p.logs});
  this.events.push({version:++this.version,type:'log',playerId:id,count});
  if(this.events.length>256)this.events.shift();
  this.save();return true;
 }
 save(){
  try{this.storage?.setItem(this.saveKey,JSON.stringify(this.snapshot()));}
  catch{} // Storage may be unavailable; network layer must surface persistence failure.
 }
 snapshot(){return {ownerId:this.ownerId,seed:this.seed,version:this.version,entities:[...this.entities],inventories:[...this.inventories]};}
}
