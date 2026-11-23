// Title screen over the running simulation: readiness text, scrolling tips and
// the start button. Readiness, not a timer, decides when the player may enter.
export class LoadingScreen {
 constructor(app){
  this.started=false;
  const loading=document.createElement('div');
  loading.style.cssText='position:fixed;inset:0;z-index:20;background:#080e18ee;color:#e8f5ff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;text-align:center;padding:24px;box-sizing:border-box;font:15px system-ui';
  const gameTitle=document.createElement('h1');
  gameTitle.textContent='QUIVER MOBILE';
  gameTitle.style.cssText='margin:0;font:700 clamp(30px,8vw,62px) system-ui;letter-spacing:.13em';
  const status=document.createElement('div');
  status.setAttribute('role','status');
  status.setAttribute('aria-live','polite');
  status.style.cssText='font:14px monospace;white-space:pre-line;max-width:90vw';
  const startButton=document.createElement('button');
  startButton.textContent='START GAME';startButton.type='button';
  startButton.style.cssText='display:none;padding:14px 36px;border:1px solid #8cb7cf;border-radius:5px;background:#254762;color:white;font:700 18px system-ui;touch-action:manipulation';
  const tipStyle=document.createElement('style');
  tipStyle.textContent='@keyframes quiverTipScroll{from{transform:translateX(100vw)}to{transform:translateX(-100%)}}';
  const tipTrack=document.createElement('div');
  tipTrack.style.cssText='position:absolute;bottom:0;left:0;right:0;overflow:hidden;white-space:nowrap;padding:12px 0;background:#08121bdd;border-top:1px solid #526477;text-align:left;pointer-events:none';
  const tipText=document.createElement('span');
  tipText.textContent='TIP: Try to use up your old resources before gathering better quality.  Your resources qualities average in inventory.';
  tipText.style.cssText='display:inline-block;padding-left:0;font:13px system-ui;animation:quiverTipScroll 19s linear infinite';
  tipTrack.append(tipText);
  loading.append(tipStyle,gameTitle,status,startButton,tipTrack);
  app.append(loading);
  this.root=loading;this.statusEl=status;this.button=startButton;
 }
 status(message){this.statusEl.textContent=message;}
 showStart(show){this.button.style.display=show?'block':'none';this.button.disabled=!show;}
 onStart(handler){
  this.button.addEventListener('click',()=>{
   if(this.started||this.button.disabled)return;
   this.started=true;
   this.root.remove();
   handler();
  });
 }
}
