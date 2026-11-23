// Initialization stage bookkeeping. Systems report READY or FAILED by name; the
// newest failure is mirrored to the owner console and to local storage.
export class StatusReport {
 constructor({storageKey='quiver-last-stages',onFailed=null}={}){
  this.stages=new Map();
  this.reported=new Map();
  this.storageKey=storageKey;
  this.onFailed=onFailed;
  window.addEventListener('error',e=>this.report('script','FAILED',e.message));
  window.addEventListener('unhandledrejection',e=>this.report('promise','FAILED',e.reason?.message||String(e.reason)));
 }
 report(name,state,detail=''){
  this.stages.set(name,{state,detail:String(detail)});
  const problems=this.failures();
  const lines=problems.map(([key,value])=>key+': '+value.state+(value.detail?' — '+value.detail:'')).join('\n');
  try{localStorage.setItem(this.storageKey,lines);}catch{}
  if(this.onFailed&&problems.length)this.onFailed(problems,this.reported);
 }
 failures(){return [...this.stages].filter(([,value])=>value.state==='FAILED');}
 state(name){return this.stages.get(name)?.state;}
}
