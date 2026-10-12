// Fixed-layout inventory and admin console. Panels resize the WebGL canvas
// rather than covering it. Registered commands are explicit, never eval'd.
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
  header.textContent=title+'  ▾';
  header.setAttribute('aria-expanded','false');
  header.style.cssText='flex:0 0 44px;border:0;background:#1b3040;color:inherit;text-align:left;padding:0 16px;font:600 14px system-ui;touch-action:manipulation';
  const content=document.createElement('div');
  content.style.cssText='display:none;flex:1;min-height:0;overflow:auto;padding:12px;box-sizing:border-box';
  if(edge==='bottom'){panel.append(content,header);}else panel.append(header,content);
  header.addEventListener('click',()=>this.toggle(id));
  app.append(panel);
  return {panel,header,content,edge,id};
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
   panel.header.textContent=(panel.id==='admin'?'ADMIN':'INVENTORY')+(open?'  ×':'  ▾');
  }
  const top=this.openPanel==='admin'?window.innerHeight*.5:44;
  const bottom=this.openPanel==='inventory'?window.innerHeight*.5:44;
  this.canvas.style.position='fixed';
  this.canvas.style.left='0';
  this.canvas.style.top=top+'px';
  this.canvas.style.bottom=bottom+'px';
  this.canvas.style.width='100vw';
  this.canvas.style.height='auto';
  if(this.controls?.slider){
   this.controls.slider.style.top=(top+12)+'px';
   this.controls.slider.style.height=Math.max(40,window.innerHeight-top-bottom-24)+'px';
  }
  if(this.controls?.swimButtons)this.controls.swimButtons.style.bottom=(bottom+12)+'px';
 }
 makeInventory(){
  const heading=document.createElement('div');
  heading.textContent='Equipment and resources — fixed slots';
  heading.style.marginBottom='10px';
  const grid=document.createElement('div');
  grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:8px';
  for(const [id,label] of [['axe','Axe'],['hammer','Hammer'],['logs','4 m Logs'],['tool-1','Empty'],['tool-2','Empty'],['resource-1','Empty'],['resource-2','Empty'],['resource-3','Empty']]){
   const slot=document.createElement('div');
   slot.style.cssText='min-height:64px;padding:8px;border:1px solid #526477;border-radius:5px;display:flex;flex-direction:column;justify-content:center;gap:4px;background:#172430';
   const name=document.createElement('strong');name.textContent=label;
   const quantity=document.createElement('span');quantity.style.fontSize='12px';
   slot.append(name,quantity);grid.append(slot);
   this.slots.set(id,{slot,name,quantity});
  }
  this.bottom.content.append(heading,grid);
  this.refreshInventory();
 }
 refreshInventory(){
  const count=this.sharedWorld.getPlayer(this.playerId)?.logs||0;
  for(const [id,entry] of this.slots){
   if(id==='logs')entry.quantity.textContent=count+' collected';
   else if(id==='axe')entry.quantity.textContent='Chopping tool';
   else if(id==='hammer')entry.quantity.textContent='Building tool (planned)';
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
  const [name,...args]=line.split(/\s+/);
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
