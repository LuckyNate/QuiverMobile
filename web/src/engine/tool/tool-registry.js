// Tool definitions and permissions only; the inventory remains authoritative.
export class ToolRegistry {
 constructor(definitions={axe:{resourceTypes:['tree']},pick:{resourceTypes:['rock','mineral-deposit']},scythe:{resourceTypes:['grass','flower','bush']},hammer:{resourceTypes:['structure']}}){
  this.definitions=new Map(Object.entries(definitions).map(([name,rule])=>
   [name,{resourceTypes:Object.freeze([...(rule.resourceTypes||[])])}]));
 }
 supports(tool,objectType){
  return Boolean(tool&&this.definitions.get(tool)?.resourceTypes.includes(objectType));
 }
}
