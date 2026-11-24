import * as THREE from 'three';
import {WorldObject} from '../entity/world-object.js';

// A creature is a persistent world object that also has a body clock. The frozen
// `position` is the seeded slot it belongs to; `at` is where it stands right now,
// so a wanderer can drift across its territory and still be replaced in place.
export class Creature extends WorldObject {
 constructor({id,type,position,home=position,state='idle',maxHealth=1,health=maxHealth,
  speed=1,territory=10,spacing=0}={}){
  super({id,type,position,state});
  if(!Number.isFinite(maxHealth)||maxHealth<=0)throw new RangeError('Creature needs positive max health');
  if(!Array.isArray(home)||home.length!==3||!home.every(Number.isFinite))
   throw new TypeError('Creature home must be a finite [x,y,z]');
  this.at=new THREE.Vector3(...position);
  this.home=new THREE.Vector3(...home);
  this.maxHealth=maxHealth;
  this.health=Math.max(0,Math.min(maxHealth,health));
  this.speed=speed;
  this.territory=territory;
  this.spacing=spacing;   // body radius it keeps clear of the next creature, in metres
  this.heading=null;   // tangent direction it faces; null until the system seats it
  this.target=null;    // current patrol point
  this.stateTime=0;
  this.swingClock=0;
  this.bit=false;          // this lunge has already bitten
  this.fade=1;
  this.dead=false;
  this.tip=0;       // 0 upright, 1 flat on its side: the death fall
  this.harvested=false;
 }
 get alive(){return !this.dead;}
 snapshot(){
  return {...super.snapshot(),maxHealth:this.maxHealth,health:this.health};
 }
}
