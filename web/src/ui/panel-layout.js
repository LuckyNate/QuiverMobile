// Panel chrome and viewport layout for the fixed admin/inventory overlays.
export const panelLayout={
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
,
 toggle(id){
  this.openPanel=this.openPanel===id?null:id;
  this.layout();
 }
,
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
  if(this.controls?.swimButtons)this.controls.swimButtons.style.bottom=(occupiedBottom+12)+'px';
 }
};
