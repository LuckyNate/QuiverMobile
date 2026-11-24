import * as THREE from 'three';

// One arrow, one draw. How far the arrow carries is decided by how long the
// string was held, so letting go early drops it short and holding too long
// flies it past the animal. Nothing here knows what a boar is: it is the
// arithmetic of a bow, and the caller supplies where it stands and what it aims
// at.
export const BOW=Object.freeze({
 // The furthest an arrow can reach, and the only range the bow will draw at.
 range:18,
 // A full draw takes this long; holding longer adds nothing.
 drawSeconds:2.2,
 // Release tolerance in metres, and how much it grows with distance so a far
 // shot is not a frame-perfect demand.
 tolerance:1.6,
 toleranceShare:.18,
 // Flight: ground speed, the bulge above the straight line, the bow's height on
 // the avatar and where in a target the arrow is aimed.
 speed:26,
 apex:2,
 startHeight:1.35,
 hitHeight:.8
});

const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));

// How far a shot carries, from how long the string was held.
export function carry(hold,bow=BOW){
 const seconds=Number.isFinite(hold)?Math.max(0,hold):0;
 return clamp(seconds/bow.drawSeconds,0,1)*bow.range;
}

// The release window at a given distance, in metres of carry.
export function toleranceAt(gap,bow=BOW){
 return Math.max(bow.tolerance,gap*bow.toleranceShare);
}

// One shot, planned at the moment the string is let go. A target beyond the
// bow's range is refused outright: the bow is not even raised.
export function planShot({from,to,up,hold,bow=BOW}={}){
 const ground=up.clone().normalize();
 const flat=to.clone().sub(from);
 flat.addScaledVector(ground,-flat.dot(ground));
 const gap=flat.length();
 if(gap>bow.range)return {fired:false,reason:'range',gap};
 const dir=gap>1e-6?flat.clone().divideScalar(gap):new THREE.Vector3();
 const travel=carry(hold,bow);
 const tolerance=toleranceAt(gap,bow);
 const hit=Math.abs(travel-gap)<=tolerance;
 // A hit flies to the animal; a miss lands where the draw actually reached, so
 // a short release stops in the grass and a long one sails past.
 const distance=hit?gap:travel;
 const start=from.clone().addScaledVector(ground,bow.startHeight);
 const end=from.clone().addScaledVector(dir,distance).addScaledVector(ground,hit?bow.hitHeight:0);
 const apex=Math.min(bow.apex,.35+distance*.1);
 const flight=Math.max(.2,distance/bow.speed);
 // A parabola over the line from bow to landing: nothing at either end, tallest
 // in the middle, always measured along the local up.
 const pointAt=s=>start.clone().lerp(end,s).addScaledVector(ground,apex*4*s*(1-s));
 const velocityAt=s=>end.clone().sub(start).divideScalar(flight)
  .addScaledVector(ground,apex*4*(1-2*s)/flight);
 return {fired:true,hit,gap,travel,tolerance,distance,start,end,apex,flight,pointAt,velocityAt};
}
