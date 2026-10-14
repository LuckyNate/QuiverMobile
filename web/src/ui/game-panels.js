import * as THREE from 'three';
import {refineAvatarShape} from '../engine/avatar-shape.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DYE_COLORS} from '../engine/dye-palette.js';
import {TOOL_RECIPES} from '../engine/shared-world.js';
// Fixed-layout inventory and admin console overlay the full-size WebGL canvas.
// Registered commands are explicit, never eval'd.
export class GamePanels {
 constructor({app,canvas,controls,sharedWorld,playerId}){
  this.canvas=canvas;this.controls=controls;this.sharedWorld=sharedWorld;
  this.playerId=playerId;this.openPanel=null;this.commands=new Map();
  this.top=this.makePanel(app,'admin','ADMIN','top');
  this.bottom=this.makePanel(app,'inventory','INVENTORY','bottom');
  this.slots=new Map();
  this.makeInventory();
  this.makeConsole();
  this.registerCommand('help',()=>[...this.commands.keys()].sort().join(', '),'List commands');
  this.registerCommand('clear',()=>{this.output.replaceChildren();return '';},'Clear console');
  this.layout();
 }
 makePanel(app,id,title,edge){
  const panel=document.createElement('section');
  panel.setAttribute('aria-label',title);
  panel.style.cssText='position:fixed;left:0;right:0;z-index:6;display:flex;flex-direction:column;background:#101923ef;color:#e5edf5;border:1px solid #577287;font:14px system-ui;box-sizing:border-box;overflow:hidden;'+edge+':0;height:44px';
  const header=document.createElement('button');
  const headerTitle=document.createElement('span');
  headerTitle.textContent=title+'  ▾';
  header.append(headerTitle);
  let profiler=null;
  if(id==='admin'){
   profiler=document.createElement('span');
   profiler.style.cssText='font:10px/12px monospace;text-align:right;white-space:normal;overflow-wrap:anywhere;flex:1;min-width:0';
   profiler.textContent='FPS -- | move -- collision -- physics -- LOD -- render -- frame --';
   header.append(profiler);
  }
  header.setAttribute('aria-expanded','false');
  header.style.cssText='flex:0 0 44px;border:0;background:#1b3040;color:inherit;text-align:left;padding:0 10px;font:600 14px system-ui;touch-action:manipulation;display:flex;align-items:center;gap:8px';
  const content=document.createElement('div');
  content.style.cssText='display:none;flex:1;min-height:0;overflow:auto;padding:12px;box-sizing:border-box';
  if(edge==='bottom'){panel.append(content,header);}else panel.append(header,content);
  header.addEventListener('click',()=>this.toggle(id));
  app.append(panel);
  return {panel,header,headerTitle,profiler,content,edge,id};
 }
 toggle(id){
  this.openPanel=this.openPanel===id?null:id;
  this.layout();
 }
 layout(){
  for(const panel of [this.top,this.bottom]){
   const open=this.openPanel===panel.id;
   panel.panel.style.height=open?'50dvh':'44px';
   panel.content.style.display=open?'block':'none';
   panel.header.setAttribute('aria-expanded',String(open));
   panel.headerTitle.textContent=(panel.id==='admin'?'ADMIN':'INVENTORY')+(open?'  ×':'  ▾');
  }
  // Overlay the same WebGL viewport. Opening a panel cannot change canvas size.
  this.canvas.style.position='fixed';
  this.canvas.style.inset='0';
  this.canvas.style.width='100%';
  this.canvas.style.height='100%';
  this.canvas.style.bottom='auto';
  const occupiedTop=this.openPanel==='admin'?window.innerHeight*.5:44;
  const occupiedBottom=this.openPanel==='inventory'?window.innerHeight*.5:44;
  if(this.controls?.slider){
   this.controls.slider.style.top=(occupiedTop+12)+'px';
   this.controls.slider.style.height=Math.max(40,window.innerHeight-occupiedTop-occupiedBottom-24)+'px';
  }
  if(this.controls?.swimButtons)this.controls.swimButtons.style.bottom=(occupiedBottom+12)+'px';
 }
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
 makeGear(pane){
  const view=document.createElement('div');
  view.style.cssText='position:relative;width:min(100%,380px);height:310px;margin:0 auto;background:#101923;border:1px solid #354a5a;border-radius:8px;overflow:hidden';
  const preview=document.createElement('canvas');
  preview.width=380;preview.height=310;
  preview.setAttribute('aria-label','Player avatar equipment preview');
  preview.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
  view.append(preview);
  // Connections are drawn behind the slots and align with avatar body regions.
  const lines=document.createElementNS('http://www.w3.org/2000/svg','svg');
  lines.setAttribute('viewBox','0 0 380 310');
  lines.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
  const definitions=[
   ['head','Head',8,12,190,45],['torso','Torso',286,85,190,120],
   ['arms','Arms',8,83,154,116],['hands','Hands',286,151,225,165],
   ['hips','Hips',8,153,190,176],['legs','Legs',286,216,195,228],
   ['feet','Feet',8,220,187,280]
  ];
  this.gearSlots=new Map();
  for(const [id,label,x,y,ax,ay] of definitions){
   const fromX=x<100?94:286,fromY=y+17;
   const connector=document.createElementNS('http://www.w3.org/2000/svg','path');
   connector.setAttribute('d',`M${fromX} ${fromY} L${x<100?115:265} ${fromY} L${ax} ${ay}`);
   connector.setAttribute('fill','none');connector.setAttribute('stroke','#7892a3');
   connector.setAttribute('stroke-width','1.5');lines.append(connector);
  }
  view.append(lines);
  const makeSlot=(id,label,x,y,width=86)=>{
   const slot=document.createElement('button');
   slot.type='button';slot.textContent=label;slot.disabled=true;
   slot.addEventListener('click',()=>{if(this.sharedWorld.craftAndEquipGear(this.playerId,id))this.refreshInventory();});
   slot.style.cssText=`position:absolute;left:${x}px;top:${y}px;width:${width}px;height:34px;padding:2px;font:600 12px system-ui;border:1px solid #d45c5c;border-radius:4px;background:#522429;color:#ffe0e0;box-sizing:border-box;touch-action:manipulation`;
   slot.title='Empty — no equipment available yet';
   view.append(slot);this.gearSlots.set(id,slot);
  };
  for(const [id,label,x,y] of definitions)makeSlot(id,label,x,y);
  // Adjacent hand slots share a border; future two-handed items span both.
  const left=document.createElement('button'),right=document.createElement('button');
  for(const [button,label] of [[left,'Left Hand'],[right,'Right Hand']]){
   button.type='button';button.textContent=label;button.disabled=true;
   button.addEventListener('click',()=>{const id=button===left?'left-hand':'right-hand';if(this.sharedWorld.craftAndEquipGear(this.playerId,id))this.refreshInventory();});
   button.style.cssText='flex:1;min-width:0;height:36px;border:1px solid #d45c5c;background:#522429;color:#ffe0e0;font:600 12px system-ui';
   button.title='Empty — weapons not yet defined';
  }
  left.style.borderRadius='5px 0 0 5px';right.style.borderRadius='0 5px 5px 0';
  right.style.borderLeft='0';
  const handRow=document.createElement('div');
  handRow.style.cssText='position:absolute;left:94px;right:94px;bottom:4px;display:flex;gap:0';
  handRow.append(left,right);view.append(handRow);
  this.gearSlots.set('left-hand',left);this.gearSlots.set('right-hand',right);
  const hint=document.createElement('div');
  hint.style.cssText='font:12px system-ui;color:#b8c6d0;margin:8px auto;max-width:380px;text-align:center';
  hint.textContent='Red: empty · Yellow: craftable upgrade · Green: equipped';
  pane.append(view,hint);
  this.gearPreview={canvas:preview,view,renderer:null,scene:null,camera:null,model:null};
 }
 renderGearPreview(){
  const p=this.gearPreview;
  if(!p||p.renderer)return;
  try{
   const renderer=new THREE.WebGLRenderer({canvas:p.canvas,alpha:true,antialias:true});
   renderer.setPixelRatio(1);
   renderer.setSize(380,310,false);
   const scene=new THREE.Scene();
   scene.add(new THREE.HemisphereLight(0xffffff,0x556070,2.4));
   const camera=new THREE.PerspectiveCamera(34,380/310,.1,40);
   camera.position.set(3,2.25,6);
   p.renderer=renderer;p.scene=scene;p.camera=camera;
   new GLTFLoader().load(new URL('models/debug/quiver_block_avatar.glb',document.baseURI).href,gltf=>{
    refineAvatarShape(gltf.scene);
    p.model=gltf.scene;scene.add(gltf.scene);
    const bounds=new THREE.Box3().setFromObject(gltf.scene);
    const center=bounds.getCenter(new THREE.Vector3());
    const size=bounds.getSize(new THREE.Vector3());
    camera.lookAt(center);
    const distance=Math.max(3,size.y*2.15);
    camera.position.copy(center).add(new THREE.Vector3(distance*.25,size.y*.08,distance));
    camera.lookAt(center);
    this.paintGearPreview();
   });
  }catch(error){console.warn('Gear preview unavailable',error);}
 }
 paintGearPreview(){
  const p=this.gearPreview;
  if(p?.renderer&&p.model&&this.activeInventoryTab==='gear'&&this.openPanel==='inventory')
   p.renderer.render(p.scene,p.camera);
 }
 refreshGear(){
  if(!this.gearSlots)return;
  const gear=this.sharedWorld.getInventory(this.playerId).gear||{};
  for(const [id,button] of this.gearSlots){
   const item=gear[id]||null;
   // No recipes or items are invented here; later gear registry will supply them.
   const equipped=Boolean(item?.equipped);
   const craftable=this.sharedWorld.canCraftGear(this.playerId,id);
   button.style.background=craftable?'#796420':equipped?'#225937':'#522429';
   button.style.borderColor=craftable?'#d6b243':equipped?'#4eac69':'#d45c5c';
   button.textContent=item?.name||({'left-hand':'Left Hand','right-hand':'Right Hand'}[id]||id[0].toUpperCase()+id.slice(1));
   button.disabled=!craftable;
   button.title=craftable?'Craft and equip':equipped?'Equipped':'Empty — no equipment available yet';
  }
  this.paintGearPreview();
 }
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
 makeConsole(){
  const intro=document.createElement('p');
  intro.textContent='Owner console. Enter help to list registered commands.';
  const output=document.createElement('div');
  output.style.cssText='white-space:pre-wrap;font:12px monospace;min-height:70px;max-height:22dvh;overflow:auto';
  this.output=output;
  const form=document.createElement('form');
  form.style.cssText='display:flex;gap:8px;margin-top:12px';
  const input=document.createElement('input');
  input.placeholder='Console command';input.setAttribute('aria-label','Admin command');
  input.style.cssText='flex:1;min-width:0;padding:10px;color:white;background:#08121b;border:1px solid #6e899b';
  const submit=document.createElement('button');submit.type='submit';submit.textContent='Run';
  submit.style.cssText='padding:10px 18px';
  form.append(input,submit);
  form.addEventListener('submit',e=>{
   e.preventDefault();
   const line=input.value.trim();input.value='';
   if(!line)return;
   const result=this.execute(line);
   if(result)this.print('> '+line+'\n'+result);
  });
  this.top.content.append(intro,output,form);
 }
 registerCommand(name,handler,description=''){
  if(!/^[a-z][a-z0-9-]*$/.test(name))throw Error('Invalid console command');
  if(this.commands.has(name))throw Error('Duplicate console command: '+name);
  this.commands.set(name,{handler,description});
 }
 execute(line){
  if(this.sharedWorld.ownerId!==this.playerId)return 'Owner permissions required.';
  const [rawName,...args]=line.split(/\s+/);
  const name=rawName.replace(/^\//,'');
  const command=this.commands.get(name.toLowerCase());
  if(!command)return 'Unknown command: '+name;
  try{return String(command.handler(args)||'');}
  catch(error){return 'Command failed: '+error.message;}
 }
 print(message){
  const entry=document.createElement('div');entry.textContent=message;
  this.output.append(entry);this.output.scrollTop=this.output.scrollHeight;
 }
}
