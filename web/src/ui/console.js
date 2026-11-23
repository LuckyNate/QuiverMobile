// Owner console UI and command registry. Commands are explicit, never eval'd.
export class ConsolePanel {
 constructor({container,sharedWorld,playerId}){
  this.sharedWorld=sharedWorld;this.playerId=playerId;this.commands=new Map();
  this.make(container);
  this.registerCommand('help',()=>[...this.commands.keys()].sort().join(', '),'List commands');
  this.registerCommand('clear',()=>{this.output.replaceChildren();return '';},'Clear console');
 }
 make(container){
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
  container.append(intro,output,form);
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
