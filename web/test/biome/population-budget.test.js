import test from 'node:test';
import assert from 'node:assert/strict';
import {PopulationBudget} from '../../src/engine/biome/biome-population.js';

test('tolerance is a dead band that still refills to target',()=>{
 const budget=new PopulationBudget({target:18,tolerance:2});
 assert.equal(budget.shouldRefill(17),false); // one missing, inside the band
 assert.equal(budget.shouldRefill(16),false); // two missing, still inside
 assert.equal(budget.shouldRefill(15),true);  // three missing, starts refilling
 assert.equal(budget.shouldRefill(17,true),true); // once refilling it carries on
 assert.equal(budget.shouldRefill(18,true),false); // and stops at the target
 assert.equal(budget.missing(18),0);
 assert.equal(budget.missing(25),0);
});

test('a budget rejects a negative target or tolerance',()=>{
 assert.throws(()=>new PopulationBudget({target:-1}),/target/);
 assert.throws(()=>new PopulationBudget({tolerance:-2}),/tolerance/);
});
