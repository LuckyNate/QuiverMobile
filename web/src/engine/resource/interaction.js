// What a touch offers on one kind of inhabitant: the verb, what has to be in
// hand, how close the avatar has to stand, and whether it fires on the tap or on
// arrival. Rules are data so a new kind — an enemy, a flower — declares its own
// instead of adding a branch to the touch handler. Streaming never reads this.
//
// when:'onTap'     The tap acts, but only if the avatar is already in reach with
//                  the right tool. Out of reach the tap only walks you closer and
//                  nothing is remembered, so no later walk or tool swap can set
//                  off an action the player did not just ask for.
// when:'onArrive'  The tap is a remembered intent: walking up to the target
//                  carries it out. Only for hands-free pickups — sticks, stones,
//                  flowers, herbs. Nothing tool-gated is set off by a walk.
export const TOUCH_WHEN=Object.freeze(['onTap','onArrive']);

// One offer. `applies` narrows it to a state of the subject (a carcass, a
// standing tree); `reach` is a number, or a function of what is in hand so a
// weapon's own reach can speak for itself.
export class Touch {
 constructor({verb,tool=null,reach=Infinity,when='onTap',applies=null,run}={}){
  if(typeof verb!=='string'||!verb)throw new TypeError('Touch requires a verb');
  if(!(tool===null||typeof tool==='string'))throw new TypeError('Touch '+verb+' has an invalid tool');
  if(!(typeof reach==='number'||typeof reach==='function'))throw new TypeError('Touch '+verb+' has an invalid reach');
  if(typeof reach==='number'&&!(reach>=0))throw new RangeError('Touch '+verb+' has a negative reach');
  if(!TOUCH_WHEN.includes(when))throw new RangeError('Unknown touch when: '+when);
  if(applies!==null&&typeof applies!=='function')throw new TypeError('Touch '+verb+' has an invalid applies');
  if(typeof run!=='function')throw new TypeError('Touch '+verb+' requires a run handler');
  Object.assign(this,{verb,tool,reach,when,applies,run});
  Object.freeze(this);
 }
 reachWith(hand={}){return typeof this.reach==='function'?this.reach(hand):this.reach;}
 // Right now, with this in hand, at this distance, on this subject: does the
 // offer apply? The first offer that says yes is the action.
 offers(subject,{tool=null,weapon=null,distance=Infinity}={}){
  if(this.applies&&!this.applies(subject))return false;
  if(this.tool!==null&&tool!==this.tool)return false;
  return distance<=this.reachWith({tool,weapon});
 }
}

// One table of what a touch can do, keyed by inhabitant type. Nothing in here
// names a type: an enemy registers beside a tree and is touched by the same rule.
export class TouchRegistry {
 constructor(){this.types=new Map();}
 register(type,{find,at,offers}={}){
  if(typeof type!=='string'||!type)throw new TypeError('Touch registration requires a type');
  if(this.types.has(type))throw new Error('Duplicate touch type: '+type);
  if(typeof find!=='function')throw new TypeError('Touch '+type+' requires a find handler');
  if(typeof at!=='function')throw new TypeError('Touch '+type+' requires an at handler');
  if(!Array.isArray(offers)||!offers.length)throw new RangeError('Touch '+type+' needs at least one offer');
  const frozen=Object.freeze(offers.map(offer=>offer instanceof Touch?offer:new Touch(offer)));
  this.types.set(type,Object.freeze({type,find,at,offers:frozen}));
  return this.types.get(type);
 }
 get(type){return this.types.get(type)||null;}
 // The action this touch would take right now, or null. Only `onTap` offers
 // answer: an `onArrive` one is settled by walking there, not by asking.
 resolve(type,id,hand={}){
  const entry=this.types.get(type);
  if(!entry)return null;
  if(typeof hand.position?.distanceTo!=='function')throw new TypeError('Touch requires the avatar position');
  const subject=entry.find(id);
  if(!subject)return null;
  const distance=entry.at(subject).distanceTo(hand.position);
  const tool=hand.tool??null,weapon=hand.weapon??null;
  for(const offer of entry.offers){
   if(offer.when!=='onTap')continue;
   if(offer.offers(subject,{tool,weapon,distance}))return {subject,offer};
  }
  return null;
 }
 // The verb a touch would say, for messages and tests, or null.
 action(type,id,hand){return this.resolve(type,id,hand)?.offer.verb??null;}
 // Carry out the touch. False means the tap only walks you closer.
 act(type,id,hand){
  const found=this.resolve(type,id,hand);
  if(!found)return false;
  found.offer.run(found.subject,hand);
  return true;
 }
 get size(){return this.types.size;}
}
