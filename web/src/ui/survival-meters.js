// Survival meters: one small ring per need, stacked on the left. The ring is a
// clock-style arc that drains clockwise from the top and fades to transparent as
// its value approaches zero; a faint track stays behind so the slot is still
// readable when the need is nearly empty. The most urgent need (lowest value) is
// kept at the front of the stack, so the list reorders itself.
const RING=34;
const TRACK_ALPHA=.16;
const ringMask='mask:radial-gradient(circle,#000 0 58%,transparent 59%);'+
 '-webkit-mask:radial-gradient(circle,#000 0 58%,transparent 59%)';
export const panelSurvival={
 makeSurvivalMeters(app){
  const stack=document.createElement('div');
  stack.setAttribute('aria-label','Survival needs');
  stack.style.cssText='position:fixed;left:10px;top:56px;z-index:5;display:flex;flex-direction:column;gap:6px;'+
   'pointer-events:none;visibility:hidden';
  app.append(stack);
  this.survivalStack=stack;
  this.survivalMeters=new Map();
  this.survivalOrder=[];
 },
 setSurvivalVisible(visible){
  if(this.survivalStack)this.survivalStack.style.visibility=visible?'visible':'hidden';
 },
 makeSurvivalMeter(need){
  const el=document.createElement('div');
  el.dataset.need=need.id;
  el.title=need.id;
  el.style.cssText='position:relative;width:'+RING+'px;height:'+RING+'px;border-radius:50%;'+
   'background:rgba(16,25,35,.55)';
  const track=document.createElement('div');
  track.style.cssText='position:absolute;inset:0;border-radius:50%;'+ringMask+
   ';background:rgba(229,237,245,'+TRACK_ALPHA+')';
  const ring=document.createElement('div');
  ring.style.cssText='position:absolute;inset:0;border-radius:50%;'+ringMask;
  const face=document.createElement('div');
  face.style.cssText='position:absolute;inset:0;display:grid;place-items:center;'+
   'font:600 11px system-ui;color:#e5edf5;text-shadow:0 1px 2px #000a';
  el.append(track,ring,face);
  this.survivalStack.append(el);
  return {el,ring,face};
 },
 updateSurvival(needs){
  if(!this.survivalStack)return;
  for(const need of needs){
   let meter=this.survivalMeters.get(need.id);
   if(!meter){meter=this.makeSurvivalMeter(need);this.survivalMeters.set(need.id,meter);}
   const value=Math.max(0,Math.min(1,need.value));
   // Clock arc: starts at twelve o'clock and unwinds clockwise.
   meter.ring.style.background='conic-gradient(from -90deg,rgba('+need.colour+',1) '+
    (value*360).toFixed(1)+'deg,rgba(0,0,0,0) 0)';
   // Colour drains to transparent as the need empties.
   meter.ring.style.opacity=value.toFixed(3);
   meter.face.textContent=need.label;
   meter.face.style.opacity=(.3+.7*value).toFixed(3);
   meter.el.setAttribute('aria-label',need.id+' '+Math.round(value*100)+'%');
  }
  const order=needs.map(need=>need.id);
  if(order.join()!==this.survivalOrder.join()){
   this.survivalOrder=order;
   for(const id of order)this.survivalStack.append(this.survivalMeters.get(id).el);
  }
 }
};
