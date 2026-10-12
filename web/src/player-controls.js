import * as THREE from 'three';

// Input only. The physics body owns position; this class returns intent.
export class PlayerControls {
 constructor(canvas){
  this.canvas=canvas;this.keys=new Set();this.pointers=new Map();
  this.moveId=null;this.lookId=null;this.mode='one';
  this.x=0;this.y=0;this.lookDX=0;this.lookDY=0;
  this.swimUp=false;this.swimDown=false;this.zoom=8;
  this.onKeyDown=e=>{if(e.target?.matches?.('input,textarea,[contenteditable]'))return;const key=e.key.toLowerCase();this.keys.add(key);if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(key))e.preventDefault();};
  this.onKeyUp=e=>this.keys.delete(e.key.toLowerCase());
  window.addEventListener('keydown',this.onKeyDown);
  window.addEventListener('keyup',this.onKeyUp);
  canvas.style.touchAction='none';
  canvas.addEventListener('pointerdown',e=>{
   if(e.pointerType==='mouse'&&e.button!==0)return;
   canvas.setPointerCapture(e.pointerId);
   this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,originX:e.clientX,originY:e.clientY});
   this.assign();
  });
  canvas.addEventListener('pointermove',e=>{
   const p=this.pointers.get(e.pointerId);if(!p)return;
   if(e.pointerId===this.lookId){this.lookDX+=e.clientX-p.x;this.lookDY+=e.clientY-p.y;}
   p.x=e.clientX;p.y=e.clientY;this.updateStick();
  });
  const release=e=>{if(!this.pointers.delete(e.pointerId))return;this.assign();};
  canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
  window.addEventListener('blur',()=>{this.pointers.clear();this.keys.clear();this.assign();this.swimUp=false;this.swimDown=false;});
  canvas.addEventListener('wheel',e=>{e.preventDefault();this.setZoom(this.zoom*Math.exp(e.deltaY*.001));},{passive:false});
  this.slider=document.createElement('input');this.slider.type='range';this.slider.min='0';this.slider.max='1000';this.slider.step='1';
  this.slider.setAttribute('aria-label','Camera zoom');
  this.slider.style.cssText='position:fixed;right:12px;top:18%;height:45dvh;width:28px;z-index:5;writing-mode:vertical-lr;direction:rtl;touch-action:none;accent-color:#79b0ce';
  this.slider.addEventListener('input',()=>this.setZoom(3*Math.pow((500/3),Number(this.slider.value)/1000)));
  document.getElementById('app').append(this.slider);
  this.setZoom(8);
  this.swimButtons=document.createElement('div');
  this.swimButtons.style.cssText='position:fixed;bottom:90px;right:16px;z-index:4;display:none;flex-direction:column;gap:10px';
  for(const [label,field] of [['UP','swimUp'],['DIVE','swimDown']]){
   const button=document.createElement('button');button.textContent=label;
   button.style.cssText='padding:14px 18px;background:#173b54;color:white;border:1px solid #79b0ce;border-radius:9px;font:16px monospace;touch-action:none';
   button.addEventListener('pointerdown',e=>{e.preventDefault();this[field]=true;button.setPointerCapture(e.pointerId);});
   for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>{this[field]=false;});
   this.swimButtons.append(button);
  }
  document.getElementById('app').append(this.swimButtons);
 }
 assign(){
  const entries=[...this.pointers.entries()];
  const oldMode=this.mode;
  this.mode=entries.length>=2?'two':'one';
  if(entries.length>=2){
   entries.sort((a,b)=>a[1].x-b[1].x);
   this.moveId=entries[0][0];this.lookId=entries[entries.length-1][0];
  }else{this.moveId=entries[0]?.[0]??null;this.lookId=null;}
  if(oldMode!==this.mode)for(const p of this.pointers.values()){p.originX=p.x;p.originY=p.y;}
  this.lookDX=0;this.lookDY=0;this.updateStick();
 }
 updateStick(){
  const p=this.pointers.get(this.moveId);
  this.x=p?THREE.MathUtils.clamp((p.x-p.originX)/90,-1,1):0;
  this.y=p?THREE.MathUtils.clamp((p.originY-p.y)/90,-1,1):0;
 }
 axes(){
  const key=(a,b)=>Number(this.keys.has(a)||this.keys.has(b));
  return {
   x:THREE.MathUtils.clamp(this.x+key('d','arrowright')-key('a','arrowleft'),-1,1),
   y:THREE.MathUtils.clamp(this.y+key('w','arrowup')-key('s','arrowdown'),-1,1)
  };
 }
 consumeLook(){const result={x:this.lookDX,y:this.lookDY};this.lookDX=0;this.lookDY=0;return result;}
 setZoom(value){
  this.zoom=THREE.MathUtils.clamp(value,3,500);
  this.slider.value=String(Math.round(1000*Math.log(this.zoom/3)/Math.log((500/3))));
 }
 setSwimming(enabled){
  this.swimButtons.style.display=enabled?'flex':'none';
  if(!enabled){this.swimUp=false;this.swimDown=false;}
 }
 swimAxis(){return Number(this.swimUp||this.keys.has(' '))-Number(this.swimDown||this.keys.has('shift'));}
}
