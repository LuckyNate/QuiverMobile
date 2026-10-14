export const TOOL_RECIPES={axe:{sticks:1,stones:1},hammer:{sticks:1,stones:1,logs:1},scythe:{sticks:3,stones:3}};
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
 getUnlockedDyes(id){return this.getInventory(id).unlockedDyes||[];}
 unlockDye(id,colorId){
  if(!this.players.has(id)||!Number.isInteger(colorId)||colorId<0||colorId>=64)return false;
  const previous=this.getInventory(id);
  const unlocked=new Set(previous.unlockedDyes||[]);
  if(unlocked.has(colorId))return true;
  unlocked.add(colorId);
  this.inventories.set(id,{...previous,unlockedDyes:[...unlocked].sort((a,b)=>a-b)});
  this.events.push({version:++this.version,type:'dye-unlocked',playerId:id,colorId});
  if(this.events.length>256)this.events.shift();
  this.save();return true;
 }
 getEquippedTool(id){const tool=this.getInventory(id).equippedTool||null;return tool&&this.hasTool(id,tool)?tool:null;}
 setEquippedTool(id,tool){
  if(!this.players.has(id)||!(tool===null||Object.hasOwn(TOOL_RECIPES,tool)))return false;
  if(tool&&!this.hasTool(id,tool))return false;
  const previous=this.getInventory(id);
  if((previous.equippedTool||null)===tool)return true;
  this.inventories.set(id,{...previous,equippedTool:tool});
  this.events.push({version:++this.version,type:'equipment',playerId:id,tool});
  if(this.events.length>256)this.events.shift();
  this.save();return true;
 }
 hasTool(id,tool){return (this.getInventory(id).craftedTools||[]).includes(tool);}
 canCraftTool(id,tool){
  const recipe=TOOL_RECIPES[tool];if(!recipe||this.hasTool(id,tool))return false;
  const inv=this.getInventory(id);
  return Object.entries(recipe).every(([resource,amount])=>(inv[resource]||0)>=amount);
 }
 craftTool(id,tool){
  if(!this.players.has(id)||!this.canCraftTool(id,tool))return false;
  const previous=this.getInventory(id),next={...previous};
  for(const [resource,amount] of Object.entries(TOOL_RECIPES[tool]))next[resource]-=amount;
  next.craftedTools=[...(previous.craftedTools||[]),tool];
  this.inventories.set(id,next);
  this.events.push({version:++this.version,type:'tool-crafted',playerId:id,tool});
  if(this.events.length>256)this.events.shift();
  this.save();return true;
 }
 awardResource(id,type,count=1){
  if(!this.players.has(id)||!['sticks','stones'].includes(type)||!Number.isSafeInteger(count)||count<1)return false;
  const previous=this.getInventory(id);
  this.inventories.set(id,{...previous,[type]:(previous[type]||0)+count});
  this.events.push({version:++this.version,type:'resource',playerId:id,resource:type,count});
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
 awardFibers(id,count=5,quality=1){
  if(!this.players.has(id)||!Number.isSafeInteger(count)||count<1||!Number.isFinite(quality)||quality<=0)return false;
  const previous=this.getInventory(id);
  const fibers=(previous.fibers||0)+count;
  const fiberQuality=(previous.fiberQuality||0)+count*quality;
  this.inventories.set(id,{...previous,fibers,fiberQuality});
  this.events.push({version:++this.version,type:'fibers',playerId:id,count,quality});
  if(this.events.length>256)this.events.shift();
  this.save();return true;
 }
 save(){
  try{this.storage?.setItem(this.saveKey,JSON.stringify(this.snapshot()));}
  catch{} // Storage may be unavailable; network layer must surface persistence failure.
 }
 snapshot(){return {ownerId:this.ownerId,seed:this.seed,version:this.version,entities:[...this.entities],inventories:[...this.inventories]};}
}
