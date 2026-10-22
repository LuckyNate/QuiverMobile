import * as THREE from 'three';
import {WORLD_SCALE} from './engine/world-config.js';

// Input only. The physics body owns position; this class returns intent.
export class PlayerControls {
 constructor(canvas){
  this.canvas=canvas;this.enabled=false;this.keys=new Set();this.pointers=new Map();
  this.moveId=null;this.lookId=null;
  this.x=0;this.y=0;this.lookDX=0;this.lookDY=0;
  this.swimUp=false;this.swimDown=false;this.zoom=8;
  this.onTap=null;this.onManualMove=null;this.tapStart=new Map();
  this.onKeyDown=e=>{if(!this.enabled)return;if(e.target?.matches?.('input,textarea,[contenteditable]'))return;const key=e.key.toLowerCase();this.keys.add(key);if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(key))e.preventDefault();};
  this.onKeyUp=e=>this.keys.delete(e.key.toLowerCase());
  window.addEventListener('keydown',this.onKeyDown);
  window.addEventListener('keyup',this.onKeyUp);
  canvas.style.touchAction='none';
  canvas.addEventListener('pointerdown',e=>{
   if(!this.enabled||(e.pointerType==='mouse'&&e.button!==0))return;
   canvas.setPointerCapture(e.pointerId);
   const side=e.clientX<canvas.getBoundingClientRect().left+canvas.getBoundingClientRect().width/2?'move':'look';
   this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,originX:e.clientX,originY:e.clientY,side});
   this.tapStart.set(e.pointerId,{x:e.clientX,y:e.clientY,moved:false,multi:this.pointers.size>1});
   if(this.pointers.size>1)for(const tap of this.tapStart.values())tap.multi=true;
   this.assign();
  });
  canvas.addEventListener('pointermove',e=>{
   if(!this.enabled)return;
   const p=this.pointers.get(e.pointerId);if(!p)return;
   if(e.pointerId===this.lookId){this.lookDX+=e.clientX-p.x;this.lookDY+=e.clientY-p.y;}
   const tap=this.tapStart.get(e.pointerId);
   if(tap&&Math.hypot(e.clientX-tap.x,e.clientY-tap.y)>12)tap.moved=true;
   p.x=e.clientX;p.y=e.clientY;this.updateStick();
   if(e.pointerId===this.moveId&&(Math.abs(this.x)+Math.abs(this.y)>.06))this.onManualMove?.();
  });
  const release=e=>{
   const tap=this.tapStart.get(e.pointerId);this.tapStart.delete(e.pointerId);
   if(!this.pointers.delete(e.pointerId))return;
   this.assign();
   if(e.type==='pointerup'&&tap&&!tap.moved&&!tap.multi)this.onTap?.(e.clientX,e.clientY);
  };
  canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
  window.addEventListener('blur',()=>{this.pointers.clear();this.tapStart.clear();this.keys.clear();this.assign();this.swimUp=false;this.swimDown=false;});
  canvas.addEventListener('wheel',e=>{e.preventDefault();if(!this.enabled)return;this.setZoom(this.zoom*Math.exp(e.deltaY*.001));},{passive:false});
  this.slider=document.createElement('input');this.slider.type='range';this.slider.min='0';this.slider.max='1000';this.slider.step='1';
  this.slider.setAttribute('aria-label','Camera zoom');
  this.slider.style.cssText='position:fixed;right:12px;top:18%;height:45dvh;width:28px;z-index:5;writing-mode:vertical-lr;direction:rtl;touch-action:none;accent-color:#79b0ce';
  this.slider.addEventListener('input',()=>{if(!this.enabled)return;this.setZoom(3*Math.pow((WORLD_SCALE.cameraMaxZoomMeters/3),Number(this.slider.value)/1000));});
  document.getElementById('app').append(this.slider);
  this.setZoom(8);
  this.swimButtons=document.createElement('div');
  this.swimButtons.style.cssText='position:fixed;bottom:90px;right:16px;z-index:4;display:none;flex-direction:column;gap:10px';
  for(const [label,field] of [['UP','swimUp'],['DIVE','swimDown']]){
   const button=document.createElement('button');button.textContent=label;
   button.style.cssText='padding:14px 18px;background:#173b54;color:white;border:1px solid #79b0ce;border-radius:9px;font:16px monospace;touch-action:none';
   button.addEventListener('pointerdown',e=>{e.preventDefault();if(!this.enabled)return;this[field]=true;button.setPointerCapture(e.pointerId);});
   for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>{this[field]=false;});
   this.swimButtons.append(button);
  }
  document.getElementById('app').append(this.swimButtons);
  this.setEnabled(false);
 }
 setEnabled(enabled){
  this.enabled=Boolean(enabled);
  if(!this.enabled){this.keys.clear();this.pointers.clear();this.swimUp=false;this.swimDown=false;this.assign();}
  this.slider.style.visibility=this.enabled?'visible':'hidden';
  this.swimButtons.style.visibility=this.enabled?'visible':'hidden';
 }
 assign(){
  // Touch role is fixed at pointer-down by screen half, independent of other fingers.
  // Preserve each active thumb's origin when the other thumb is added or removed.
  this.moveId=[...this.pointers].find(([,p])=>p.side==='move')?.[0]??null;
  this.lookId=[...this.pointers].find(([,p])=>p.side==='look')?.[0]??null;
  this.lookDX=0;this.lookDY=0;this.updateStick();
 }
 updateStick(){
  const p=this.pointers.get(this.moveId);
  this.x=p?THREE.MathUtils.clamp((p.x-p.originX)/90,-1,1):0;
  this.y=p?THREE.MathUtils.clamp((p.originY-p.y)/90,-1,1):0;
 }
 axes(){
  if(!this.enabled)return {x:0,y:0};
  const key=(a,b)=>Number(this.keys.has(a)||this.keys.has(b));
  if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].some(k=>this.keys.has(k)))this.onManualMove?.();
  return {
   x:THREE.MathUtils.clamp(this.x+key('d','arrowright')-key('a','arrowleft'),-1,1),
   y:THREE.MathUtils.clamp(this.y+key('w','arrowup')-key('s','arrowdown'),-1,1)
  };
 }
 consumeLook(){if(!this.enabled){this.lookDX=0;this.lookDY=0;return {x:0,y:0};}const result={x:this.lookDX,y:this.lookDY};this.lookDX=0;this.lookDY=0;return result;}
 setZoom(value){
  this.zoom=THREE.MathUtils.clamp(value,3,WORLD_SCALE.cameraMaxZoomMeters);
  this.slider.value=String(Math.round(1000*Math.log(this.zoom/3)/Math.log((WORLD_SCALE.cameraMaxZoomMeters/3))));
 }
 setSwimming(enabled){
  this.swimButtons.style.display=enabled?'flex':'none';
  if(!enabled){this.swimUp=false;this.swimDown=false;}
 }
 swimAxis(){if(!this.enabled)return 0;return Number(this.swimUp||this.keys.has(' '))-Number(this.swimDown||this.keys.has('shift'));}
}
