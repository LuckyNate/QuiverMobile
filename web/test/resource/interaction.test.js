import test from 'node:test';
import assert from 'node:assert/strict';
import {Touch,TouchRegistry,TOUCH_WHEN} from '../../src/engine/resource/interaction.js';

// A vector stub: the registry only ever asks how far two things are apart.
const at=distance=>({distanceTo:()=>distance});
const hand=(distance,tool=null,weapon=null)=>({position:at(distance),tool,weapon});

function registryFor(offers,subject){
 const ran=[];
 const registry=new TouchRegistry();
 registry.register('boar',{
  find:id=>id==='subject'?subject:null,
  at:target=>target.at,
  offers:offers(ran)
 });
 return {registry,ran};
}

test('a tool-gated touch acts only when it is in reach with the right tool',()=>{
 const {registry,ran}=registryFor(ran=>[
  {verb:'fell',tool:'axe',reach:2.4,run:()=>ran.push('fell')}
 ],{at:at(1),state:'standing'});
 assert.equal(registry.action('boar','subject',hand(1,'axe')),'fell');
 assert.equal(registry.act('boar','subject',hand(1,'axe')),true);
 assert.deepEqual(ran,['fell']);
});

test('out of reach the touch only walks, and is not remembered',()=>{
 const {registry,ran}=registryFor(ran=>[
  {verb:'fell',tool:'axe',reach:2.4,run:()=>ran.push('fell')}
 ],{at:at(9),state:'standing'});
 assert.equal(registry.action('boar','subject',hand(9,'axe')),null);
 assert.equal(registry.act('boar','subject',hand(9,'axe')),false);
 assert.deepEqual(ran,[]);
});

test('the wrong tool in reach still only walks',()=>{
 const {registry,ran}=registryFor(ran=>[
  {verb:'fell',tool:'axe',reach:2.4,run:()=>ran.push('fell')}
 ],{at:at(1),state:'standing'});
 for(const tool of ['knife','scythe',null])assert.equal(registry.act('boar','subject',hand(1,tool)),false);
 assert.deepEqual(ran,[]);
});

test('the first offer that applies wins, so a carcass is skinned not struck',()=>{
 const carcass={at:at(1),dead:true};
 const {registry,ran}=registryFor(ran=>[
  {verb:'skin',tool:'knife',reach:1.6,applies:c=>c.dead,run:()=>ran.push('skin')},
  {verb:'attack',tool:null,applies:c=>!c.dead,reach:()=>2,run:()=>ran.push('attack')}
 ],carcass);
 assert.equal(registry.action('boar','subject',hand(1,'knife')),'skin');
 const living={at:at(1),dead:false};
 const second=registryFor(ran=>[
  {verb:'skin',tool:'knife',reach:1.6,applies:c=>c.dead,run:()=>ran.push('skin')},
  {verb:'attack',tool:null,applies:c=>!c.dead,reach:()=>2,run:()=>ran.push('attack')}
 ],living);
 assert.equal(second.registry.action('boar','subject',hand(1,null,{reach:2})),'attack');
});

test('reach may come from the weapon in hand, and a bow reaches nothing',()=>{
 const {registry}=registryFor(()=>[
  {verb:'attack',tool:null,applies:()=>true,
   reach:({weapon})=>weapon&&!weapon.ranged?weapon.reach:0,run:()=>{}}
 ],{at:at(1.5),dead:false});
 assert.equal(registry.action('boar','subject',hand(1.5,'club',{reach:1.6})),'attack');
 assert.equal(registry.action('boar','subject',hand(1.5,'bow',{reach:9,ranged:true})),null);
 assert.equal(registry.action('boar','subject',hand(1.5,null,null)),null);
});

test('an on-arrival intent is never the answer to a tap',()=>{
 const {registry,ran}=registryFor(ran=>[
  {verb:'pick',tool:null,reach:1,when:'onArrive',run:()=>ran.push('pick')}
 ],{at:at(1),state:'standing'});
 assert.equal(registry.action('boar','subject',hand(1)),null);
 assert.equal(registry.act('boar','subject',hand(1)),false);
 assert.deepEqual(ran,[]);
});

test('an absent subject or an unknown type does nothing',()=>{
 const {registry}=registryFor(()=>[{verb:'fell',tool:'axe',reach:2,run:()=>{}}],{at:at(1)});
 assert.equal(registry.act('boar','gone',hand(1,'axe')),false);
 assert.equal(registry.act('enemy','subject',hand(1,'axe')),false);
});

test('a kind cannot be registered twice and every offer is frozen',()=>{
 const registry=new TouchRegistry();
 const entry=registry.register('tree',{
  find:()=>null,at:t=>t.at,offers:[{verb:'fell',tool:'axe',reach:1,run:()=>{}}]
 });
 assert.throws(()=>registry.register('tree',{find:()=>null,at:t=>t.at,offers:[{verb:'fell',run:()=>{}}]}),
  /Duplicate touch type/);
 assert.throws(()=>{entry.offers[0].verb='cut';},TypeError);
 assert.ok(entry.offers[0] instanceof Touch);
 assert.equal(registry.size,1);
});

test('the contract refuses offers it could never honour',()=>{
 const bad=[
  [{reach:1,run:()=>{}},/requires a verb/],
  [{verb:'fell',reach:-1,run:()=>{}},/negative reach/],
  [{verb:'fell',reach:1},/requires a run handler/],
  [{verb:'fell',reach:1,when:'onHover',run:()=>{}},/Unknown touch when/]
 ];
 for(const [offer,error] of bad)assert.throws(()=>new Touch(offer),error);
 assert.deepEqual([...TOUCH_WHEN],['onTap','onArrive']);
});
