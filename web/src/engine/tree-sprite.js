import * as THREE from 'three';

// Draws one tree model into a texture once, so trees past the imposter distance
// can be a single flat card instead of three instanced meshes. Returns the
// texture and the model's real size in metres, which sizes the card.
export function renderTreeSprite(build,{width=160,height=256}={}){
 let renderer=null;
 try{
  const canvas=document.createElement('canvas');
  renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(1);
  renderer.setSize(width,height,false);
  renderer.setClearColor(0,0);
  const scene=new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xeeeeff,0x263b55,2.1));
  const sun=new THREE.DirectionalLight(0xffffff,2);
  sun.position.set(9,18,7);
  scene.add(sun);
  const model=build();
  scene.add(model);
  const box=new THREE.Box3().setFromObject(model);
  const size=box.getSize(new THREE.Vector3());
  const centre=box.getCenter(new THREE.Vector3());
  const camera=new THREE.PerspectiveCamera(28,width/height,.1,size.y*8+20);
  const reach=Math.max(size.y,(size.x*height)/width);
  const distance=(reach/2)/Math.tan(THREE.MathUtils.degToRad(14))*1.02;
  // Straight on, lifted a little: the underside of the canopy stays out of sight
  // the way it is from eye level in the world.
  camera.position.set(centre.x,centre.y+size.y*.08,centre.z+distance);
  camera.lookAt(centre);
  renderer.render(scene,camera);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  return {texture,size};
 }catch(error){
  console.warn('Tree sprite unavailable',error);
  return null;
 }finally{
  // One draw is all this renderer is for; the canvas keeps its pixels.
  renderer?.dispose();
 }
}
