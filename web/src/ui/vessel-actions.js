import * as THREE from 'three';

// What the pot in the hand can do, offered over the pot itself: clean water is
// drunk or cooked with, the meal it holds is eaten, and a pot on the fire shows how
// long it has left. Only what is possible right now is offered, so the cook button
// never opens onto an empty list of recipes.
const BUTTON_STYLE='pointer-events:auto;padding:8px 14px;background:#20313f;color:#eaf4ff;border:1px solid #4899e8;border-radius:16px;font:600 13px system-ui;touch-action:manipulation';
const NOTE_STYLE='pointer-events:none;padding:4px 8px;background:#0c1620cc;color:#cfe6f7;border-radius:10px;font:600 12px system-ui;white-space:nowrap';
// Ingredient keys as words; anything unlisted still reads as its key.
const ITEM_NAMES={dandies:'Dandies',rawBacon:'Raw bacon'};
const itemName=key=>ITEM_NAMES[key]||key;

export class VesselActions {
 // hand(point) writes the world position of the held vessel into point; the game
 // supplies it, since the fist that holds the tool belongs to the avatar.
 constructor({app,camera,hand,shared,playerId='local-owner',kitchen,atFire,isActive}){
  Object.assign(this,{app,camera,hand,shared,playerId,kitchen,atFire,isActive});
  this.root=document.createElement('div');
  this.root.style.cssText='position:fixed;left:0;top:0;z-index:6;display:none;flex-direction:column-reverse;gap:6px;align-items:center;transform:translate(-50%,-100%)';
  app.append(this.root);
  // What the overlay currently shows, so the DOM is only rebuilt when it changes.
  this.signature='';
  this.point=new THREE.Vector3();
 }
 hide(){
  this.root.style.display='none';
  this.signature='';
 }
 update(){
  if(!this.isActive())return this.hide();
  const equipped=this.shared.getEquippedTool(this.playerId);
  const actions=this.actionsFor(equipped),note=this.noteFor(equipped);
  if(!actions.length&&!note)return this.hide();
  const hand=this.hand(this.point);
  if(!hand||!this.place(hand))return this.hide();
  const signature=actions.map(action=>action.label).join('|')+'#'+note;
  if(signature!==this.signature){
   this.signature=signature;
   this.root.replaceChildren();
   if(note){
    const label=document.createElement('div');
    label.style.cssText=NOTE_STYLE;label.textContent=note;
    this.root.append(label);
   }
   for(const action of actions){
    const button=document.createElement('button');
    button.type='button';button.textContent=action.label;button.style.cssText=BUTTON_STYLE;
    button.addEventListener('click',()=>{action.run();this.update();});
    this.root.append(button);
   }
  }
  this.root.style.display='flex';
 }
 // Sits just above the fist, so the buttons belong to the thing being held.
 place(hand){
  const screen=hand.project(this.camera);
  if(screen.z<0||screen.z>1)return false;
  if(Math.abs(screen.x)>1||Math.abs(screen.y)>1)return false;
  this.root.style.left=((screen.x+1)*.5*window.innerWidth)+'px';
  this.root.style.top=((1-screen.y)*.5*window.innerHeight-26)+'px';
  return true;
 }
 actionsFor(equipped){
  if(equipped!=='pot')return [];
  const kitchen=this.kitchen;
  // The meal is eaten from the pot it was cooked in.
  if(kitchen.canEat())return [{label:'Eat',run:()=>kitchen.eat()}];
  if(kitchen.pot!=='clean')return [];
  const actions=[{label:'Drink',run:()=>kitchen.drink()}];
  // Cooking needs the fire under the pot and something the pack can cover.
  if(this.atFire()&&kitchen.recipes().length)actions.push({label:'Cook',run:()=>this.openRecipes(kitchen.recipes())});
  return actions;
 }
 // The one thing the pot is waiting for, when it is not something to press.
 noteFor(equipped){
  if(equipped!=='pot')return '';
  if(this.kitchen.boiling)return 'Boiling · '+Math.ceil(this.kitchen.boilLeft())+'s';
  return this.kitchen.pot==='raw'?'Boil it on a fire':'';
 }
 // Only the recipes the pack can cover are listed; with nothing to cook there is
 // nothing to open.
 openRecipes(recipes){
  if(!recipes.length)return;
  const sheet=document.createElement('div');
  sheet.style.cssText='position:fixed;inset:0;z-index:20;display:grid;place-items:center;background:#050a0fcc';
  const card=document.createElement('div');
  card.style.cssText='min-width:250px;max-width:80vw;padding:16px;display:flex;flex-direction:column;gap:8px;background:#101923;border:1px solid #526477;border-radius:10px;color:#eaf4ff;font:600 14px system-ui';
  const title=document.createElement('strong');
  title.textContent='Cook';
  card.append(title);
  for(const recipe of recipes){
   const button=document.createElement('button');
   button.type='button';
   button.style.cssText=BUTTON_STYLE+'border-radius:6px;text-align:left';
   const needs=Object.entries(recipe.needs).map(([item,count])=>itemName(item)+' ×'+count).join(', ');
   button.textContent=recipe.name+(needs?' — '+needs:'');
   button.addEventListener('click',()=>{sheet.remove();this.kitchen.cook(recipe.id);this.update();});
   card.append(button);
  }
  const cancel=document.createElement('button');
  cancel.type='button';cancel.textContent='Cancel';
  cancel.style.cssText=BUTTON_STYLE+'border-radius:6px;background:#1b2530;border-color:#526477;color:#9fb3c2';
  cancel.addEventListener('click',()=>sheet.remove());
  card.append(cancel);
  sheet.append(card);
  this.app.append(sheet);
 }
}
