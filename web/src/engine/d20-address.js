// Stable identifiers for the 20 root faces and their recursive 4-way children.
export const D20_FACE_COUNT=20;
export function formatAddress(face,path=[]){
 if(!Number.isInteger(face)||face<0||face>=D20_FACE_COUNT)throw new RangeError('Invalid D20 face');
 if(!Array.isArray(path)||path.some(n=>!Number.isInteger(n)||n<0||n>3))throw new RangeError('Invalid D20 child path');
 const root='F'+String(face).padStart(2,'0');
 return path.length?root+':'+path.join('.'):root;
}
export function parseAddress(address){
 if(typeof address!=='string'||!/^F(?:0[0-9]|1[0-9])(?::[0-3](?:\.[0-3])*)?$/.test(address))
  throw new RangeError('Invalid D20 address');
 const [root,children]=address.split(':');
 const path=children?children.split('.').map(Number):[];
 return {face:Number(root.slice(1)),path,level:path.length};
}
export function rootAddress(face){return formatAddress(face);}
export function appendChild(address,child){
 const {face,path}=parseAddress(address);
 return formatAddress(face,[...path,child]);
}
export function parentAddress(address){
 const {face,path}=parseAddress(address);
 return path.length?formatAddress(face,path.slice(0,-1)):null;
}
// Reconstruct the normalized corners of an addressed triangle using the same
// four-child ordering as WorldTerrain. Caller supplies its root corners and
// midpoint function; no rendered geometry or per-chunk state is required.
export function triangleAtAddress(address,roots,midpoint){
 const {face,path}=parseAddress(address);
 if(!roots[face])throw new RangeError('Missing D20 root face');
 let [a,b,c]=roots[face];
 for(const child of path){
  const ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);
  if(child===0)[a,b,c]=[a,ab,ca];
  else if(child===1)[a,b,c]=[ab,b,bc];
  else if(child===2)[a,b,c]=[ca,bc,c];
  else [a,b,c]=[ab,bc,ca];
 }
 return [a,b,c];
}
