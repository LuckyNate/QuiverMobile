// Two-bone analytic IK, adapted from Jim's embodiment sandbox.
// The requested end contact stays fixed unless it exceeds anatomical reach.
const subtract=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const length=v=>Math.hypot(v.x,v.y,v.z);
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const scaled=(v,k)=>({x:v.x*k,y:v.y*k,z:v.z*k});
const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});

export function solveTwoBone(root,target,upper,lower,bendHint){
 if(!(upper>0&&lower>0))throw new RangeError('Bone lengths must be positive');
 const delta=subtract(target,root),distance=length(delta);
 const aim=distance>1e-8?scaled(delta,1/distance):{x:0,y:-1,z:0};
 const minReach=Math.abs(upper-lower)+1e-5;
 const maxReach=upper+lower-1e-5;
 const reach=Math.max(minReach,Math.min(maxReach,distance));
 const end=add(root,scaled(aim,reach));
 const along=(upper*upper+reach*reach-lower*lower)/(2*reach);
 const height=Math.sqrt(Math.max(0,upper*upper-along*along));
 let bend=subtract(bendHint,scaled(aim,dot(bendHint,aim)));
 let bendLength=length(bend);
 if(bendLength<1e-8){
  const basis=Math.abs(aim.y)<.9?{x:0,y:1,z:0}:{x:1,y:0,z:0};
  bend=subtract(basis,scaled(aim,dot(basis,aim)));
  bendLength=length(bend);
 }
 const joint=add(add(root,scaled(aim,along)),scaled(bend,height/bendLength));
 return {joint,end,reachable:distance<=upper+lower&&distance>=Math.abs(upper-lower)};
}
