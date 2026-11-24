import * as THREE from 'three';

// One white-noise field, used twice on the ground: as a tint multiplied into the
// colour underneath it, and as the normal map that breaks up its lighting. Both
// textures come from the same texels, so every bright speck is also a bump.
// Seeded with the world's own hash, not Math.random(), so the grain belongs to
// the world seed: the same seed always grows the same ground.
function noiseField(size,seed){
 const values=new Float32Array(size*size);
 let state=seed>>>0;
 for(let i=0;i<values.length;i++){
  state=(Math.imul(state,1664525)+1013904223)>>>0;
  values[i]=state/4294967296;
 }
 return values;
}

function texture(bytes,size){
 const tex=new THREE.DataTexture(bytes,size,size,THREE.RGBAFormat);
 tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
 tex.magFilter=THREE.NearestFilter;
 tex.minFilter=THREE.LinearMipmapLinearFilter;
 tex.generateMipmaps=true;
 tex.anisotropy=4;
 tex.needsUpdate=true;
 return tex;
}

export function createGroundNoise(size=128,seed=0x5eed){
 const values=noiseField(size,seed);
 // Tint: a multiplier near 1, dark enough to read as grain but never as dirt.
 // The colour underneath still decides what the ground looks like.
 const tintBytes=new Uint8Array(size*size*4);
 const normalBytes=new Uint8Array(size*size*4);
 const at=(x,y)=>values[((y+size)%size)*size+((x+size)%size)];
 // The normal is the slope of the same field, so the bumps and the grain agree.
 const strength=.55;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=(y*size+x);
  const shade=Math.round(255*(.8+.2*values[i]));
  tintBytes[i*4]=shade;tintBytes[i*4+1]=shade;tintBytes[i*4+2]=shade;tintBytes[i*4+3]=255;
  const dx=(at(x+1,y)-at(x-1,y))*.5*strength;
  const dy=(at(x,y+1)-at(x,y-1))*.5*strength;
  const length=Math.sqrt(dx*dx+dy*dy+1);
  normalBytes[i*4]=Math.round(255*(-dx/length*.5+.5));
  normalBytes[i*4+1]=Math.round(255*(-dy/length*.5+.5));
  normalBytes[i*4+2]=Math.round(255*(1/length*.5+.5));
  normalBytes[i*4+3]=255;
 }
 return {tint:texture(tintBytes,size),normal:texture(normalBytes,size)};
}
