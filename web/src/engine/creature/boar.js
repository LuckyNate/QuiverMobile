import {Creature} from './creature.js';
import {CreatureBehaviour,tangentAt} from './behaviour.js';
import {seededUnit} from '../world/seeded-hash.js';

// The Meadows boar: three hit points, so three level 1 hits put it down. It goes
// for anything that steps inside five metres and hurts you only by shouldering its
// snout into you. It falls over where it dies and stays there, a carcass, until a
// knife takes it apart.
export const BOAR=Object.freeze({
 maxHealth:3,walk:1.2,charge:3.4,territory:10,
 // Aggro is a radius, not a cone: the boar does not care which way it was facing.
 aggro:5,lose:12,
 // The snout, not the body, has to reach you: it walks up and bumps to bite.
 reach:1.15,bump:.2,damage:1,swingSeconds:1.8,alertSeconds:.25,fallSeconds:.5,
 // What a knife takes off the carcass, in inventory units.
 loot:{bacon:1,hide:1,tusks:2}
});

export class Boar extends Creature {
 constructor({id,position,home=position}){
  super({id,type:'boar',position,home,maxHealth:BOAR.maxHealth,speed:BOAR.walk,territory:BOAR.territory});
 }
}

// idle → patrol → alerted → attacking → returning, then dead where it fell.
// A boar leaves its territory only to chase, and walks back to its slot after.
export class BoarBehaviour extends CreatureBehaviour {
 constructor(tuning=BOAR){
  super({senses:{earshot:tuning.aggro,eyeshot:tuning.aggro,halfAngle:Math.PI,lose:tuning.lose}});
  this.tuning=tuning;
 }
 think(boar,dt,context){
  boar.stateTime+=dt;
  // A dead boar stops thinking: it only tips over onto its side and lies still.
  if(boar.dead||boar.state==='dead'){
   boar.tip=Math.min(1,boar.tip+dt/Math.max(.01,this.tuning.fallSeconds));
   return;
  }
  boar.swingClock=Math.max(0,boar.swingClock-dt);
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
   case 'attacking':{
    if(this.lost(boar,player)){boar.target=null;this.enter(boar,'returning');break;}
    this.face(boar,player);
    const gap=boar.at.distanceTo(player);
    if(gap>this.tuning.reach){
     this.step(boar,player.clone().sub(boar.at),this.tuning.charge*dt,context);
    }else if(boar.swingClock<=0){
     boar.swingClock=this.tuning.swingSeconds;
     // The bite is the bump: the snout is driven into the player, then it backs off.
     this.step(boar,player.clone().sub(boar.at),this.tuning.bump,context);
     context.hitPlayer(this.tuning.damage);
    }
    break;
   }
   case 'returning':
    if(seen!==null){this.enter(boar,'attacking');break;}
    if(this.arrived(boar,boar.home,1)){this.rest(boar);break;}
    this.step(boar,boar.home.clone().sub(boar.at),this.tuning.walk*dt,context);
    break;
   default:this.enter(boar,'idle');break;
  }
 }
 // Being hit is reason enough to fight, whatever the senses missed.
 provoked(boar){if(!boar.dead&&boar.state!=='dead')this.enter(boar,'alerted');}
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
