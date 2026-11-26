import test from 'node:test';
import assert from 'node:assert/strict';
import {Survival,DRINK_RESTORES} from '../../src/game/survival.js';

const close=(a,b)=>Math.abs(a-b)<1e-9;

test('a drink puts water back into the thirst meter',()=>{
 const survival=new Survival();
 survival.values.thirst=.2;
 assert.ok(close(survival.drink(),DRINK_RESTORES));
 assert.ok(close(survival.values.thirst,.2+DRINK_RESTORES));
});

test('a full thirst meter takes nothing, and nothing overflows',()=>{
 const survival=new Survival();
 survival.values.thirst=1;
 assert.equal(survival.drink(),0);
 assert.equal(survival.values.thirst,1);
 survival.values.thirst=.9;
 assert.ok(close(survival.drink(),.1));
 assert.equal(survival.values.thirst,1);
});

test('drinking touches thirst only',()=>{
 const survival=new Survival();
 const before={...survival.values};
 survival.drink();
 for(const id of ['health','hunger','warmth','stamina'])assert.equal(survival.values[id],before[id]);
 assert.ok(survival.values.thirst>before.thirst);
});
