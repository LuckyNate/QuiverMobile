// Inventory tabs, resource and tool slots, and their refresh logic.
import {DYE_COLORS} from '../engine/dye-palette.js';
import {TOOL_RECIPES} from '../engine/shared-world.js';
export const panelInventory={
 registerInventoryTab(id,label,content){
  if(this.inventoryTabs.has(id))throw new Error('Duplicate inventory tab: '+id);
  const button=document.createElement('button');
  button.type='button';button.textContent=label;
  button.style.cssText='padding:8px 14px;border:1px solid #526477;border-radius:4px;background:#1b3040;color:#e5edf5';
  button.addEventListener('click',()=>this.selectInventoryTab(id));
  this.inventoryTabBar.append(button);
  this.inventoryTabContents.append(content);
  this.inventoryTabs.set(id,{button,content});
 }
,
 selectInventoryTab(id){
  if(!this.inventoryTabs.has(id))return;
  for(const [key,tab] of this.inventoryTabs){
   const active=key===id;
   tab.content.style.display=active?'block':'none';
   tab.button.setAttribute('aria-pressed',String(active));
   tab.button.style.background=active?'#415738':'#1b3040';
  }
  this.activeInventoryTab=id;
  this.refreshInventory();
  if(id==='gear')this.renderGearPreview();
 }
,
 makeInventory(){
  this.inventoryTabs=new Map();
  this.inventoryTabBar=document.createElement('div');
  this.inventoryTabBar.style.cssText='display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap';
  this.inventoryTabContents=document.createElement('div');
  const toolsPane=document.createElement('div'),resourcesPane=document.createElement('div'),dyePane=document.createElement('div'),gearPane=document.createElement('div');
  const makeGrid=()=>{
   const grid=document.createElement('div');
   grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:8px';
   return grid;
  };
  const toolsGrid=makeGrid(),resourcesGrid=makeGrid();
  for(const [id,label,tab] of [
   ['axe','Axe','tools'],['hammer','Hammer','tools'],['scythe','Scythe','tools'],
   ['tool-1','Empty','tools'],['tool-2','Empty','tools'],
   ['logs','4 m Logs','resources'],['fibers','Fibers','resources'],['sticks','Sticks','resources'],['stones','Stones','resources'],
   ['resource-2','Empty','resources'],['resource-3','Empty','resources']
  ]){
   const isTool=id==='axe'||id==='hammer'||id==='scythe';
   const slot=document.createElement(isTool?'button':'div');
   if(isTool){
    slot.type='button';
    slot.addEventListener('click',()=>{
     const current=this.sharedWorld.getEquippedTool(this.playerId);
     if(this.sharedWorld.hasTool(this.playerId,id))this.sharedWorld.setEquippedTool(this.playerId,current===id?null:id);
     else this.sharedWorld.craftTool(this.playerId,id);
     this.refreshInventory();
    });
   }
   slot.style.cssText='min-height:64px;padding:8px;border:1px solid #526477;border-radius:5px;display:flex;flex-direction:column;justify-content:center;gap:4px;background:#172430';
   const name=document.createElement('strong');name.textContent=label;
   const quantity=document.createElement('span');quantity.style.fontSize='12px';
   slot.append(name,quantity);
   (tab==='tools'?toolsGrid:resourcesGrid).append(slot);
   this.slots.set(id,{slot,name,quantity,isTool});
  }
  toolsPane.append(toolsGrid);
  resourcesPane.append(resourcesGrid);
  const dyeGrid=document.createElement('div');
  dyeGrid.style.cssText='display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:3px;max-width:420px';
  this.dyeSwatches=[];
  for(let i=0;i<DYE_COLORS.length;i++){
   const swatch=document.createElement('div');
   swatch.style.cssText='aspect-ratio:1;min-width:0;border:1px solid #7777;border-radius:3px;display:grid;place-items:center;box-sizing:border-box;background:'+DYE_COLORS[i];
   const lock=document.createElement('span');
   lock.textContent='🔒';lock.style.cssText='font-size:clamp(10px,3vw,16px);text-shadow:0 1px 3px #000';
   swatch.append(lock);dyeGrid.append(swatch);
   this.dyeSwatches.push({swatch,lock,color:DYE_COLORS[i]});
  }
  const dyeHint=document.createElement('p');
  dyeHint.textContent='Discover dye colors to unlock them permanently.';
  dyePane.append(dyeHint,dyeGrid);
  this.bottom.content.append(this.inventoryTabBar,this.inventoryTabContents);
  this.registerInventoryTab('tools','Tools',toolsPane);
  this.registerInventoryTab('resources','Resources',resourcesPane);
  this.registerInventoryTab('dyes','Dyes',dyePane);
  this.makeGear(gearPane);
  this.registerInventoryTab('gear','Gear',gearPane);
  this.selectInventoryTab('tools');
 }
,
 refreshInventory(){
  const inventory=this.sharedWorld.getInventory(this.playerId);
  const count=inventory.logs||0;
  const totalStrength=Number.isFinite(inventory.logStrength)?inventory.logStrength:count;
  const averageStrength=count>0?totalStrength/count:0;
  const unlocked=new Set(this.sharedWorld.getUnlockedDyes(this.playerId));
  for(let i=0;i<this.dyeSwatches.length;i++){
   const {swatch,lock,color}=this.dyeSwatches[i],available=unlocked.has(i);
   lock.style.display=available?'none':'block';
   swatch.style.filter=available?'none':'grayscale(1) brightness(.40)';
   swatch.title=available?color:'Undiscovered dye';
  }
  this.refreshGear();
  const equipped=this.sharedWorld.getEquippedTool(this.playerId);
  for(const [id,entry] of this.slots){
   if(entry.isTool){
    const active=id===equipped,crafted=this.sharedWorld.hasTool(this.playerId,id),ready=this.sharedWorld.canCraftTool(this.playerId,id);
    entry.slot.style.borderColor=active?'#4899e8':crafted?'#4eac69':ready?'#d6b243':'#667078';
    entry.slot.style.background=active?'#20558b':crafted?'#225937':ready?'#796420':'#34383c';
    entry.slot.style.color=active?'#e3f2ff':crafted?'#d6ffe0':ready?'#fff0b3':'#b2b5b7';
    entry.slot.setAttribute('aria-pressed',String(active));
    entry.quantity.textContent=active?'Equipped':crafted?'Tap to equip':ready?'Tap to craft':Object.entries(TOOL_RECIPES[id]).map(([item,n])=>item+' '+(inventory[item]||0)+'/'+n).join(' · ');
   }
   if(id==='logs')entry.quantity.textContent='Count: '+count+' | Strength: '+averageStrength.toFixed(2);
   else if(id==='fibers'){
    const fibers=inventory.fibers||0;
    entry.quantity.textContent='Count: '+fibers+' | Quality: '+(fibers?(inventory.fiberQuality||0)/fibers:0).toFixed(2);
   }
   else if(id==='sticks'||id==='stones')entry.quantity.textContent='Count: '+(inventory[id]||0);
   else if(entry.isTool)continue;
   else entry.quantity.textContent='Not acquired';
  }
 }

};
