// Equipment slots and the rendered avatar preview.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {refineAvatarShape} from '../engine/avatar/avatar-shape.js';
export const panelGear={
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
,
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
,
 paintGearPreview(){
  const p=this.gearPreview;
  if(p?.renderer&&p.model&&this.activeInventoryTab==='gear'&&this.openPanel==='inventory')
   p.renderer.render(p.scene,p.camera);
 }
,
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

};
