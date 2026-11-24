// Per-cell population budget. Density sets the target a seeded cell asks for and
// tolerance is the dead band in front of it: a cell lets that many go missing
// before it bothers to replenish, and then runs back up to the target instead of
// settling permanently short. Policy only; streaming decides when and where.
export class PopulationBudget {
 constructor({target=0,tolerance=0}={}){
  if(!Number.isFinite(target)||target<0)throw new RangeError('Population target must be a non-negative count');
  if(!Number.isFinite(tolerance)||tolerance<0)throw new RangeError('Population tolerance must be a non-negative count');
  this.target=target;this.tolerance=tolerance;
 }
 missing(live){return Math.max(0,this.target-Math.max(0,live));}
 // Once a cell is refilling it keeps going until it is full again, so tolerance
 // never becomes a permanent loss. One flag per kind per cell drives this.
 shouldRefill(live,refilling=false){return refilling?live<this.target:this.missing(live)>this.tolerance;}
}
