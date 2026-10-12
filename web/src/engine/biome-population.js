// Population budgets belong to the 20 D20 root biomes. Child chunks inherit
// equal per-chunk quotas; the population system does not invent new biome types.
export const BIOME_COUNT=20;
export class BiomePopulation {
 constructor({biomeId=0,childCount=1,targets={trees:18},tolerances={trees:2}}={}){
  if(biomeId<0||biomeId>=BIOME_COUNT||childCount<1)throw new RangeError('Invalid biome population');
  this.biomeId=biomeId;this.childCount=childCount;
  this.targets=targets;this.tolerances=tolerances;
 }
 quota(type,index){
  const total=this.targets[type]||0;
  return Math.floor(total/this.childCount)+(index<total%this.childCount?1:0);
 }
 tolerance(type,index){
  const total=this.tolerances[type]||0;
  return Math.floor(total/this.childCount)+(index<total%this.childCount?1:0);
 }
 needsRespawn(type,index,count){
  return count<this.quota(type,index)-this.tolerance(type,index);
 }
}
