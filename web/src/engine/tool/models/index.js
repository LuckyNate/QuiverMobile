import {buildAxe} from './axe.js';
import {buildKnife} from './knife.js';
import {buildHammer} from './hammer.js';
import {buildScythe} from './scythe.js';
import {buildTorch} from './torch.js';
import {buildClub} from './club.js';
import {buildBow} from './bow.js';
import {buildCup,buildPot,buildPan,buildBowl,buildSaltWater,buildCleanWater,buildSoup,buildSalad,buildTea,buildGrilled} from './cookware.js';

// Tool id to model. The ids match TOOL_RECIPES, so equipping anything the player
// can craft or is granted has a model here.
const BUILDERS={axe:buildAxe,knife:buildKnife,hammer:buildHammer,scythe:buildScythe,
 torch:buildTorch,club:buildClub,bow:buildBow,cup:buildCup,pot:buildPot,pan:buildPan,bowl:buildBowl,
 // Not tools: pictures of a vessel with something in it, for the inventory.
 saltWater:buildSaltWater,cleanWater:buildCleanWater,soup:buildSoup,salad:buildSalad,tea:buildTea,
 grilled:buildGrilled};
const cache=new Map();

// One model per tool, reused across every request so equipping never rebuilds it.
export function toolModel(kind){
 const build=BUILDERS[kind];
 if(!build)return null;
 if(!cache.has(kind))cache.set(kind,build());
 return cache.get(kind);
}
