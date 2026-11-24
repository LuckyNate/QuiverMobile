import {Creature} from './creature.js';
import {CreatureBehaviour,tangentAt} from './behaviour.js';
import {seededUnit} from '../world/seeded-hash.js';

// The Meadows boar: the tutorial biome's one enemy, so it is slow to notice,
// easy to outrun and dies to three club hits. Every number a designer would
// touch lives here, next to the transitions that use it.
export const BOAR=Object.freeze({
 maxHealth:24,walk:1.2,charge:3.4,territory:10,
 senses:{earshot:12,eyeshot:14,halfAngle:Math.PI/3,lose:22},
 reach:1.7,damage:6,swingSeconds:1.8,alertSeconds:.35,dyingSeconds:.45
});

export class Boar extends Creature {
 constructor({id,position,home=position}){
  super({id,type:'boar',position,home,maxHealth:BOAR.maxHealth,speed:BOAR.walk,territory:BOAR.territory});
 }
}

// idle → patrol → alerted → attacking → returning, plus a dying beat.
// A boar leaves its territory only to chase, and walks back to its slot after.
export class BoarBehaviour extends CreatureBehaviour {
 constructor(tuning=BOAR){super({senses:tuning.senses});this.tuning=tuning;}
 think(boar,dt,context){
  boar.stateTime+=dt;
  boar.swingClock=Math.max(0,boar.swingClock-dt);
  if(boar.state==='dying'){
   boar.fade=Math.max(0,1-boar.stateTime/this.tuning.dyingSeconds);
   if(boar.stateTime>=this.tuning.dyingSeconds)context.retire(boar);
   return;
  }
  const {player}=context,seen=this.spotted(boar,player);
  switch(boar.state){
   case 'idle':
    if(seen!==null){this.enter(boar,'alerted');break;}
    if(boar.stateTime>=(boar.patrolWait??3)){this.choosePatrol(boar,context);this.enter(boar,'patrol');}
    break;
   case 'patrol':
    if(seen!==null){this.enter(boar,'alerted');break;}
    if(!boar.target||this.arrived(boar,boar.target,.75)){this.rest(boar);break;}
    this.step(boar,boar.target.clone().sub(boar.at),this.tuning.walk*dt,context);
    break;
   case 'alerted':
    if(player)this.face(boar,player);
    if(boar.stateTime>=this.tuning.alertSeconds)this.enter(boar,'attacking');
    break;
   case 'attacking':
    if(this.lost(boar,player)){boar.target=null;this.enter(boar,'returning');break;}
    this.face(boar,player);
    if(boar.at.distanceTo(player)>this.tuning.reach){
     this.step(boar,player.clone().sub(boar.at),this.tuning.charge*dt,context);
    }else if(boar.swingClock<=0){
     boar.swingClock=this.tuning.swingSeconds;
     context.hitPlayer(this.tuning.damage);
    }
    break;
   case 'returning':
    if(seen!==null){this.enter(boar,'attacking');break;}
    if(this.arrived(boar,boar.home,1)){this.rest(boar);break;}
    this.step(boar,boar.home.clone().sub(boar.at),this.tuning.walk*dt,context);
    break;
   default:this.enter(boar,'idle');break;
  }
 }
 // Being hit is reason enough to fight, whatever the senses missed.
 provoked(boar){if(!boar.dead&&boar.state!=='dying')this.enter(boar,'alerted');}
 rest(boar){
  boar.waits=(boar.waits||0)+1;
  boar.patrolWait=2+seededUnit(boar.id,'wait',boar.waits)*3;
  boar.target=null;
  this.enter(boar,'idle');
 }
 choosePatrol(boar,{height,radius}){
  boar.patrols=(boar.patrols||0)+1;
  const angle=seededUnit(boar.id,'patrol',boar.patrols)*Math.PI*2;
  const reach=Math.sqrt(seededUnit(boar.id,'range',boar.patrols))*boar.territory;
  const next=boar.at.clone().addScaledVector(tangentAt(boar.at,angle),reach).normalize();
  boar.target=next.multiplyScalar(radius+height.height(next));
 }
}

export const BOAR_BEHAVIOUR=new BoarBehaviour();
