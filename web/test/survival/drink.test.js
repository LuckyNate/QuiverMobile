import test from 'node:test';
import assert from 'node:assert/strict';
import {Survival,DRINK_RESTORES,SOUP_RESTORES,METER_CAPACITY,BUFF_MULTIPLIER,OVERFILL} from '../../src/game/survival.js';

const close=(a,b)=>Math.abs(a-b)<1e-6;

test('a drink puts water back into the thirst meter',()=>{
 const survival=new Survival();
 survival.values.thirst=2;
 assert.ok(close(survival.drink(),DRINK_RESTORES));
 assert.ok(close(survival.values.thirst,2+DRINK_RESTORES));
});

test('a full meter takes nothing, and nothing overflows',()=>{
 const survival=new Survival();
 survival.values.thirst=METER_CAPACITY;
 assert.equal(survival.drink(),0);
 assert.equal(survival.values.thirst,METER_CAPACITY);
 survival.values.thirst=METER_CAPACITY-1;
 assert.ok(close(survival.drink(),1));
 assert.equal(survival.values.thirst,METER_CAPACITY);
});

test('drinking touches thirst only',()=>{
 const survival=new Survival();
 const before={...survival.values};
 survival.drink();
 for(const id of ['health','hunger','warmth','stamina'])assert.equal(survival.values[id],before[id]);
 assert.ok(survival.values.thirst>before.thirst);
});

test('a bowl puts hunger back and touches nothing else',()=>{
 const survival=new Survival();
 survival.values.hunger=1;
 const before={...survival.values};
 assert.ok(close(survival.eat(),SOUP_RESTORES));
 assert.ok(close(survival.values.hunger,1+SOUP_RESTORES));
 for(const id of ['health','thirst','warmth','stamina'])assert.equal(survival.values[id],before[id]);
});

test('a plain drink fills to the brim, a rich one goes past it',()=>{
 const survival=new Survival();
 survival.values.thirst=METER_CAPACITY-1;
 assert.ok(close(survival.drink(4),1),'plain water stops at the brim');
 assert.ok(close(survival.values.thirst,METER_CAPACITY));
 assert.ok(close(survival.drink(4,true),METER_CAPACITY*OVERFILL-METER_CAPACITY),'tea pours past it');
 assert.ok(close(survival.values.thirst,METER_CAPACITY*OVERFILL),'up to one hundred and twenty');
 assert.equal(survival.drink(4,true),0,'a brim at one twenty takes no more');
});

test('the overflow is real meter: it drains from the top and a plain drink leaves it',()=>{
 const survival=new Survival();
 survival.values.thirst=METER_CAPACITY*OVERFILL;
 assert.equal(survival.drink(),0,'a plain drink does not cut the overflow');
 assert.ok(close(survival.values.thirst,METER_CAPACITY*OVERFILL),'still up at one twenty');
 assert.equal(survival.drink(2,true),0,'and nothing more goes in');
 survival.update(60);
 assert.ok(close(survival.values.thirst,METER_CAPACITY*OVERFILL-1),'a point a minute comes off the top');
 assert.equal(survival.speedBuff,BUFF_MULTIPLIER,'still watered');
});

test('a better meal fills hunger past the brim, a lean one does not',()=>{
 const survival=new Survival();
 survival.values.hunger=METER_CAPACITY-1;
 assert.ok(close(survival.eat(4),1),'a salad stops at the brim');
 assert.ok(close(survival.values.hunger,METER_CAPACITY));
 assert.ok(close(survival.eat(4,true),METER_CAPACITY*OVERFILL-METER_CAPACITY),'soup pours past it');
 assert.ok(close(survival.values.hunger,METER_CAPACITY*OVERFILL));
 // A belly run past its brim holds there while the rest of the world drifts.
 survival.update(60);
 assert.ok(close(survival.values.hunger,METER_CAPACITY*OVERFILL-.5),'half a point a minute comes off the top');
 assert.equal(survival.damageBuff,BUFF_MULTIPLIER,'still fed');
});

test('hunger lasts twice as long as thirst',()=>{
 const survival=new Survival();
 const thirst=survival.values.thirst,hunger=survival.values.hunger;
 for(let second=0;second<60;second++)survival.update(1);
 assert.ok(close(survival.values.thirst,thirst-1),'one point of thirst a minute');
 assert.ok(close(survival.values.hunger,hunger-.5),'half a point of hunger a minute');
 for(let second=0;second<60;second++)survival.update(1);
 assert.ok(close(survival.values.thirst,thirst-2),'two points of thirst in two minutes');
 assert.ok(close(survival.values.hunger,hunger-1),'one point of hunger in the same two');
});

test('a meter that is not empty keeps its buff, an empty one loses it',()=>{
 const survival=new Survival();
 assert.equal(survival.damageBuff,BUFF_MULTIPLIER);
 assert.equal(survival.speedBuff,BUFF_MULTIPLIER);
 survival.values.hunger=0;
 assert.equal(survival.damageBuff,1,'an empty belly is a plain swing');
 assert.equal(survival.speedBuff,BUFF_MULTIPLIER,'hunger does not touch the feet');
 survival.values.thirst=0;
 assert.equal(survival.speedBuff,1);
 survival.values.hunger=.5;
 assert.equal(survival.damageBuff,BUFF_MULTIPLIER,'half a point of hunger is still fed');
});

test('damage is in hit points out of ten',()=>{
 const survival=new Survival();
 assert.equal(survival.hurt(3),7);
 assert.equal(survival.hurt(100),0);
 assert.equal(survival.values.health,0);
});

test('the meters read as fractions of their own capacity',()=>{
 const survival=new Survival();
 const read=id=>survival.needs().find(need=>need.id===id).value;
 assert.equal(read('health'),1);
 survival.values.health=5;
 assert.equal(read('health'),.5);
 assert.ok(read('thirst')>0&&read('thirst')<1);
 // A meter run past its brim reads past one, so the UI can show the surplus.
 survival.values.thirst=METER_CAPACITY*OVERFILL;
 assert.ok(close(read('thirst'),OVERFILL));
});
