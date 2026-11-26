import test from 'node:test';
import assert from 'node:assert/strict';
import {Tree,TREE_HARVEST,TREE_REACH,TREE_TOOL} from '../../src/engine/flora/tree.js';

// A tree is a resource, so what takes it is the resource's own required tool. The
// touch table reads TREE_HARVEST; contact reads requiredTool. If those two ever
// named different tools, a pine could be solid to one and chopped by the other.
test('a tree is harvested by the tool its own resource contract requires',()=>{
 const tree=new Tree({id:'F06:tree:0:0:0',position:[0,0,0]});
 assert.equal(tree.requiredTool,TREE_TOOL);
 assert.equal(TREE_HARVEST.tool,tree.requiredTool);
 assert.equal(TREE_HARVEST.verb,'fell');
 assert.equal(TREE_HARVEST.reach,TREE_REACH);
});

// The rule is shared by every pine, so nothing may edit it at run time.
test('the tree harvest rule is fixed',()=>{
 assert.ok(Object.isFrozen(TREE_HARVEST));
 assert.throws(()=>{TREE_HARVEST.tool='knife';},TypeError);
});

// A resource only answers to its tool: bare hands never take a tree.
test('a tree only accepts its required tool',()=>{
 const tree=new Tree({id:'F06:tree:0:0:0',position:[0,0,0]});
 assert.equal(tree.canInteract({equippedTool:TREE_TOOL}),true);
 assert.equal(tree.canInteract({equippedTool:null}),false);
 assert.equal(tree.canInteract({equippedTool:'knife'}),false);
});
