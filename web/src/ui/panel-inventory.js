// Inventory tabs, resource and tool slots, and their refresh logic.
import {DYE_COLORS} from '../engine/avatar/dye-palette.js';
import {TOOL_RECIPES,WEAPON_TOOLS} from '../engine/entity/shared-world.js';
import {toolIcon} from './tool-icon.js';
// Recipe ingredients read as inventory keys; species drops get a proper name.
const RESOURCE_NAMES={logs:'4 m Logs',fibers:'Fibers',sticks:'Sticks',stones:'Stones',pineSap:'Pine Sap'};
// Unmapped keys still read as words: birchBark -> Birch Bark.
const resourceName=key=>RESOURCE_NAMES[key]||key.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/^./,c=>c.toUpperCase());
// Inventory keys that are bookkeeping rather than something you carry in a slot.
const NOT_A_RESOURCE=new Set(['equippedTool','craftedTools','unlockedDyes','gear','logStrength','fiberQuality','arrows','pot','potServings']);
// The pot carries its contents, so its slot says what is in it: the water is salt
// until the fire has boiled it, and then it is a meal.
const POT_STATE={empty:'Empty pot',raw:'Salt water',clean:'Clean water',soup:'Soup'};
const SLOT_STYLE='min-height:84px;padding:8px;border:1px solid #526477;border-radius:5px;display:flex;flex-direction:column;justify-content:center;gap:4px;background:#172430';
// A carried-item picture sits above its own words: the slot is the bucket, and the
// name and state stay readable under it rather than being replaced by the drawing.
function showPicture(entry,icon){
 entry.slot.style.backgroundImage=icon?'url('+icon+')':'none';
 entry.slot.style.backgroundSize=icon?'46px 46px':'auto';
 entry.slot.style.backgroundPosition=icon?'center 6px':'center';
 entry.slot.style.backgroundRepeat='no-repeat';
 entry.slot.style.paddingTop=icon?'54px':'8px';
}
const label=id=>id[0].toUpperCase()+id.slice(1);
export const panelInventory={
 registerInventoryTab(id,label,content){
  if(this.inventoryTabs.has(id))throw new Error('Duplicate inventory tab: '+id);
  const button=document.createElement('button');
  button.type='button';button.textContent=label;
  button.setAttribute('role','tab');
  // Tabs sit on the strip's rule and the selected one blends into the pane below,
  // the way a cardboard folder tab does, instead of floating as a pill.
  button.style.cssText='position:relative;padding:8px 16px;margin-bottom:-2px;border:1px solid #2c4152;border-bottom:0;border-radius:8px 8px 0 0;background:#16232f;color:#9fb3c2;font:600 13px system-ui;cursor:pointer;touch-action:manipulation';
  button.addEventListener('click',()=>this.selectInventoryTab(id));
  content.setAttribute('role','tabpanel');
  content.style.cssText='padding:2px 0 6px';
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
   tab.button.setAttribute('aria-selected',String(active));
   tab.button.style.background=active?'#101923':'#16232f';
   tab.button.style.color=active?'#eaf4ff':'#9fb3c2';
   tab.button.style.borderColor=active?'#526477':'#2c4152';
   tab.button.style.borderBottomColor=active?'#101923':'#16232f';
   tab.button.style.zIndex=active?'1':'0';
  }
  this.activeInventoryTab=id;
  this.refreshInventory();
  if(id==='gear')this.renderGearPreview();
 }
,
 makeInventory(){
  this.inventoryTabs=new Map();
  this.inventoryTabBar=document.createElement('div');
  this.inventoryTabBar.setAttribute('role','tablist');
  this.inventoryTabBar.style.cssText='display:flex;align-items:flex-end;flex-wrap:wrap;gap:0;margin:0 0 12px;padding:0 4px;border-bottom:2px solid #526477';
  this.inventoryTabContents=document.createElement('div');
  const toolsPane=document.createElement('div'),weaponsPane=document.createElement('div'),resourcesPane=document.createElement('div'),dyePane=document.createElement('div'),gearPane=document.createElement('div');
  const makeGrid=()=>{
   const grid=document.createElement('div');
   grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:8px';
   return grid;
  };
  const makeSlot=(id,label,{interactive=false,tag=null,note='',onClick=null}={})=>{
   const slot=document.createElement(interactive?'button':'div');
   if(interactive){
    slot.type='button';
    slot.addEventListener('click',onClick||(()=>{
     const current=this.sharedWorld.getEquippedTool(this.playerId);
     if(current===id)this.sharedWorld.setEquippedTool(this.playerId,null);
     else if(this.sharedWorld.hasTool(this.playerId,id)){
      // A vessel only comes to hand when it has something to do; tapping it with
      // nothing to serve says so instead of leaving an idle thing in the fist.
      const problem=this.vesselProblem(id);
      if(problem){this.print?.(problem);return;}
      this.sharedWorld.setEquippedTool(this.playerId,id);
     }else this.sharedWorld.craftTool(this.playerId,id);
     this.refreshInventory();
    }));
   }
   slot.style.cssText=SLOT_STYLE;
   const name=document.createElement('strong');name.textContent=label;
   const quantity=document.createElement('span');quantity.style.fontSize='12px';
   if(note)quantity.textContent=note;
   slot.append(name,quantity);
   this.slots.set(id,{slot,name,quantity,isTool:interactive&&Object.hasOwn(TOOL_RECIPES,id),tag});
   return slot;
  };
  // Craftable tools are fixed slots: they exist whether or not you have one yet.
  // The weapons craft the same way, they just live in their own tab.
  const toolsGrid=makeGrid();
  for(const id of Object.keys(TOOL_RECIPES).filter(id=>!WEAPON_TOOLS.includes(id)))toolsGrid.append(makeSlot(id,label(id),{interactive:true}));
  toolsPane.append(toolsGrid);
  const weaponsGrid=makeGrid();
  for(const id of WEAPON_TOOLS)weaponsGrid.append(makeSlot(id,label(id),{interactive:true}));
  // Arrows are ammunition: a count you spend, not something you equip.
  weaponsGrid.append(makeSlot('arrows','Arrows',{interactive:true,tag:'arrows',note:'Count: 0',onClick:()=>{
   this.sharedWorld.craftArrows(this.playerId);
   this.refreshInventory();
  }}));
  const weaponsHint=document.createElement('p');
  weaponsHint.textContent='Club, bow and arrows. Arrows come in fives.';
  weaponsPane.append(weaponsHint,weaponsGrid);
  // Resources are not listed up front: every slot here is one you have picked up,
  // created by growResources() as the inventory gains a new kind of item.
  const resourcesHint=document.createElement('p');
  resourcesHint.textContent='Nothing gathered yet.';
  resourcesHint.style.cssText='margin:0 0 8px;color:#9fb3c2;font-size:12px';
  this.resourceGrid=makeGrid();
  this.emptyResourcesHint=resourcesHint;
  resourcesPane.append(resourcesHint,this.resourceGrid);
  // What the vessels are carrying is carried too, so it is listed here beside the
  // things you pick up. An empty pot and an empty bowl show no slot at all.
  const carriedSlot=(id,title,vessel)=>{
   const slot=document.createElement('button');
   slot.type='button';
   slot.style.cssText=SLOT_STYLE+'cursor:pointer;touch-action:manipulation';
   slot.style.display='none';
   // Tapping what a vessel holds takes that vessel in hand: the bucket of clean
   // water is taken up the same way any other carried thing would be.
   slot.addEventListener('click',()=>{
    if(!this.sharedWorld.hasTool(this.playerId,vessel))return;
    const current=this.sharedWorld.getEquippedTool(this.playerId);
    this.sharedWorld.setEquippedTool(this.playerId,current===vessel?null:vessel);
    this.refreshInventory();
   });
   const name=document.createElement('strong');name.textContent=title;
   const quantity=document.createElement('span');quantity.style.fontSize='12px';
   slot.append(name,quantity);
   this.resourceGrid.append(slot);
   this.slots.set(id,{slot,name,quantity,isTool:false,tag:id});
  };
  // The pot's own slot is the tool above; this one is what the pot is carrying.
  carriedSlot('potContents','Pot','pot');
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
  this.registerInventoryTab('weapons','Weapons',weaponsPane);
  this.registerInventoryTab('resources','Resources',resourcesPane);
  this.registerInventoryTab('dyes','Dyes',dyePane);
  this.makeGear(gearPane);
  this.registerInventoryTab('gear','Gear',gearPane);
  this.selectInventoryTab('tools');
 }
,
 // A vessel only comes to hand when it has something to do: the cup needs clean
 // water in the pot, the bowl needs a meal. The pot is the carrier itself, so it
 // always comes, and anything that is not a vessel is never refused.
 vesselProblem(vessel){
  const kitchen=this.kitchen;
  if(!kitchen)return null;
  if(vessel==='cup'&&kitchen.waterServings===0)return 'Nothing clean to drink — boil salt water first.';
  if(vessel==='bowl'&&kitchen.servings===0)return 'Nothing cooked to eat — there is no soup in the pot.';
  return null;
 }
,
 // A new kind of resource only appears once it is actually carried; the slot then
 // stays so counts do not jump around the grid as things are spent.
 growResources(inventory){
  let added=false;
  for(const [key,value] of Object.entries(inventory)){
   if(NOT_A_RESOURCE.has(key)||this.slots.has(key))continue;
   if(typeof value!=='number'||value<=0)continue;
   const slot=document.createElement('div');
   slot.style.cssText=SLOT_STYLE;
   const name=document.createElement('strong');name.textContent=resourceName(key);
   const quantity=document.createElement('span');quantity.style.fontSize='12px';
   slot.append(name,quantity);
   this.resourceGrid.append(slot);
   this.slots.set(key,{slot,name,quantity,isTool:false,tag:key});
   added=true;
  }
  if(added&&this.emptyResourcesHint)this.emptyResourcesHint.style.display='none';
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
  this.growResources(inventory);
  const equipped=this.sharedWorld.getEquippedTool(this.playerId);
  for(const [id,entry] of this.slots){
   if(entry.isTool){
    const active=id===equipped,crafted=this.sharedWorld.hasTool(this.playerId,id),ready=this.sharedWorld.canCraftTool(this.playerId,id);
    entry.slot.style.borderColor=active?'#4899e8':crafted?'#4eac69':ready?'#d6b243':'#667078';
    entry.slot.style.backgroundColor=active?'#20558b':crafted?'#225937':ready?'#796420':'#34383c';
    entry.slot.style.color=active?'#e3f2ff':crafted?'#d6ffe0':ready?'#fff0b3':'#b2b5b7';
    entry.slot.setAttribute('aria-pressed',String(active));
    // Owned tools draw their own model; the recipe or state text stays for the
    // ones you cannot make yet, and as a fallback where WebGL is unavailable.
    const icon=(crafted||active)?toolIcon(id):null;
    entry.slot.style.backgroundImage=icon?'url('+icon+')':'none';
    entry.slot.style.backgroundSize='contain';
    entry.slot.style.backgroundPosition='center';
    entry.slot.style.backgroundRepeat='no-repeat';
    entry.name.style.display=icon?'none':'block';
    entry.quantity.style.display=icon?'none':'block';
    entry.quantity.textContent=active?'Equipped':crafted?'Tap to equip':ready?'Tap to craft':Object.entries(TOOL_RECIPES[id]).map(([item,n])=>resourceName(item)+' '+(inventory[item]||0)+'/'+n).join(' · ');
    const held=active?'Equipped':'Tap to equip';
    const servings=inventory.pot==='soup'?inventory.potServings||0:0;
    const water=inventory.pot==='clean'?inventory.potServings||0:0;
    if(id==='pot')entry.quantity.textContent=held+' · '+POT_STATE[inventory.pot||'empty'];
    if(id==='cup')entry.quantity.textContent=held+' · '+(water>0?'Water: '+water+' servings':'No water');
    if(id==='bowl')entry.quantity.textContent=held+' · '+(servings>0?'Soup: '+servings+' servings':'Nothing to eat');
    const title=entry.name.textContent+(active?' — equipped':crafted?' — tap to equip':'');
    entry.slot.title=title;
    entry.slot.setAttribute('aria-label',title);
   }
   else if(entry.tag==='arrows'){
    const ready=this.sharedWorld.canCraftArrows(this.playerId);
    entry.slot.style.borderColor=ready?'#d6b243':'#667078';
    entry.slot.style.backgroundColor=ready?'#796420':'#34383c';
    entry.slot.style.color=ready?'#fff0b3':'#b2b5b7';
    entry.quantity.textContent='Count: '+(inventory.arrows||0)+(ready?' · Tap to craft':'');
   }
   else if(entry.tag==='potContents'){
    // A carried pot: the picture is the pot with its contents at the brim, so salt
    // water, boiled water and soup differ by colour as well as by name.
    const contents=inventory.pot;
    entry.slot.style.display=contents?'flex':'none';
    showPicture(entry,contents?toolIcon(contents==='raw'?'saltWater':contents==='clean'?'cleanWater':'soup'):null);
    entry.name.textContent=POT_STATE[contents]||'Empty pot';
    const servings=contents&&contents!=='raw'?(inventory.potServings||0):0;
    entry.quantity.textContent=contents==='raw'?'Boil it on a fire'
     :contents?'Servings: '+servings+' · tap to equip':'';
   }
   else if(entry.tag==='logs')entry.quantity.textContent='Count: '+count+' | Strength: '+averageStrength.toFixed(2);
   else if(entry.tag==='fibers'){
    const fibers=inventory.fibers||0;
    entry.quantity.textContent='Count: '+fibers+' | Quality: '+(fibers?(inventory.fiberQuality||0)/fibers:0).toFixed(2);
   }
   else if(entry.tag)entry.quantity.textContent='Count: '+(inventory[entry.tag]||0);
  }
 }

};
