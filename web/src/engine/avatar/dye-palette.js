import * as THREE from 'three';

// Stable row-major dye IDs. This table is the single source for UI and GPU tint sampling.
export const DYE_ROWS=[
 ['#0a0a0a','#292929','#484848','#686868','#898989','#adadad','#d5d5d5','#ffffff'],
 ['#342016','#553322','#77503a','#976d4c','#b88d67','#d3ab87','#ebcaaa','#ffe1c4'],
 ['#630b16','#92202c','#bf2531','#ec3c40','#f46161','#fa8883','#ffb1a0','#ffd5c6'],
 ['#68310d','#96500f','#c87414','#eb991b','#ffc13d','#ffda74','#ffeba5','#fff3d6'],
 ['#193e18','#236124','#338735','#41b849','#71d569','#a6e59c','#d1f3bd','#edffe2'],
 ['#0b4856','#086f87','#008eaa','#17b3c8','#52cede','#89e1e9','#b8f1ef','#e5ffff'],
 ['#162d73','#2444a5','#355cc9','#567ee8','#8da6f4','#b7c7fc','#dae1ff','#f0f3ff'],
 ['#4b185f','#70268a','#953aaf','#b65acb','#d181df','#e4a9ea','#f0d0f4','#f9edfc']
];
export const DYE_COLORS=Object.freeze(DYE_ROWS.flat());
export const MEADOWS_GREEN_DYE=4*8+2; // Meadows green, fixed palette swatch.
export function dyeColor(id){return Number.isInteger(id)&&id>=0&&id<64?DYE_COLORS[id]:null;}
export function dyeUV(id){if(!dyeColor(id))return null;return {u:(id%8+.5)/8,v:(7-Math.floor(id/8)+.5)/8};}
// DataTexture row zero is bottom in UV space. Flip the row order to match the UI top row.
export function createDyePaletteTexture(){
 const data=new Uint8Array(8*8*4);
 for(let row=0;row<8;row++)for(let col=0;col<8;col++){
  const color=DYE_ROWS[7-row][col],at=(row*8+col)*4;
  data[at]=parseInt(color.slice(1,3),16);
  data[at+1]=parseInt(color.slice(3,5),16);
  data[at+2]=parseInt(color.slice(5,7),16);
  data[at+3]=255;
 }
 const texture=new THREE.DataTexture(data,8,8,THREE.RGBAFormat);
 texture.magFilter=THREE.NearestFilter;
 texture.minFilter=THREE.NearestFilter;
 texture.generateMipmaps=false;
 texture.colorSpace=THREE.SRGBColorSpace;
 texture.needsUpdate=true;
 return texture;
}
