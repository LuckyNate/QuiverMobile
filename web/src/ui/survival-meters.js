// Survival meters: one pip per need, stacked on the left. Each need owns a fixed
// slot with a faint outline, so the stack never jumps; the solid disc inside is a
// full circle that shrinks with its value down to a small dot. Colour stays solid
// at every value: the order is what tells you where to look first. The most urgent
// need (lowest value) is kept at the front of the stack.
const SLOT=26;
const INNER=SLOT-8;
const MIN_PIP=6;
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
  el.style.cssText='position:relative;width:'+SLOT+'px;height:'+SLOT+'px;border-radius:50%;'+
   'background:rgba(16,25,35,.55);box-shadow:inset 0 0 0 1px rgba(229,237,245,.18)';
  const pip=document.createElement('div');
  pip.style.cssText='position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);'+
   'border-radius:50%';
  const face=document.createElement('div');
  face.style.cssText='position:absolute;inset:0;display:grid;place-items:center;'+
   'font:600 10px system-ui;color:#e5edf5;text-shadow:0 1px 2px #000';
  el.append(pip,face);
  this.survivalStack.append(el);
  return {el,pip,face};
 },
 updateSurvival(needs){
  if(!this.survivalStack)return;
  for(const need of needs){
   let meter=this.survivalMeters.get(need.id);
   if(!meter){meter=this.makeSurvivalMeter(need);this.survivalMeters.set(need.id,meter);}
   // A meter can be run past its brim by a better dish; the circle is already full
   // at 1, so the extra reads as a bright ring instead.
   const value=Math.max(0,need.value);
   const side=Math.max(MIN_PIP,INNER*Math.min(1,value));
   meter.pip.style.width=side.toFixed(1)+'px';
   meter.pip.style.height=side.toFixed(1)+'px';
   meter.pip.style.background='rgba('+need.colour+',1)';
   meter.el.style.boxShadow=value>1
    ?'inset 0 0 0 2px rgba('+need.colour+',1), 0 0 6px rgba('+need.colour+',.9)'
    :'inset 0 0 0 1px rgba(229,237,245,.18)';
   meter.face.textContent=need.label;
   meter.el.setAttribute('aria-label',need.id+' '+Math.round(value*100)+'%');
  }
  const order=needs.map(need=>need.id);
  if(order.join()!==this.survivalOrder.join()){
   this.survivalOrder=order;
   for(const id of order)this.survivalStack.append(this.survivalMeters.get(id).el);
  }
 }
};
