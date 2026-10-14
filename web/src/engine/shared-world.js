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
 getInventory(id){return this.inventories.get(id)||{logs:0,equippedTool:null};}
 getEquippedTool(id){return this.getInventory(id).equippedTool||null;}
 setEquippedTool(id,tool){
  if(!this.players.has(id)||!(tool===null||tool==='axe'||tool==='hammer'))return false;
  const previous=this.getInventory(id);
  if((previous.equippedTool||null)===tool)return true;
  this.inventories.set(id,{...previous,equippedTool:tool});
  this.events.push({version:++this.version,type:'equipment',playerId:id,tool});
  if(this.events.length>256)this.events.shift();
  this.save();return true;
 }
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
 awardLog(id,count=1,strength=1){
  const p=this.players.get(id);
  if(!p||!Number.isSafeInteger(count)||count<1||!Number.isFinite(strength)||strength<=0)return false;
  const previous=this.getInventory(id);
  const oldCount=previous.logs||0;
  // Legacy inventory logs were Conifer-strength before strength was tracked.
  const oldStrength=Number.isFinite(previous.logStrength)?previous.logStrength:oldCount;
  const logs=oldCount+count;
  const logStrength=oldStrength+count*strength;
  p.logs=logs;
  this.inventories.set(id,{...previous,logs,logStrength});
  this.events.push({version:++this.version,type:'log',playerId:id,count,strength});
  if(this.events.length>256)this.events.shift();
  this.save();return true;
 }
 save(){
  try{this.storage?.setItem(this.saveKey,JSON.stringify(this.snapshot()));}
  catch{} // Storage may be unavailable; network layer must surface persistence failure.
 }
 snapshot(){return {ownerId:this.ownerId,seed:this.seed,version:this.version,entities:[...this.entities],inventories:[...this.inventories]};}
}
