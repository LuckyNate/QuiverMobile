// One seeded hash for every deterministic placement and per-instance look.
// The same seed and parts give the same number on every device, with no
// Math.random() and no dependence on load order or frame timing.
export function seededUnit(seed,...parts){
 let h=2166136261;
 const key=[seed,...parts].join(':');
 for(let i=0;i<key.length;i++)h=Math.imul(h^key.charCodeAt(i),16777619);
 h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;
 return (h>>>0)/4294967296;
}
