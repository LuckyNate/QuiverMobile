import * as THREE from 'three';

// Draws one tree model into a texture once, so distant trees can be a single flat
// card instead of three instanced meshes. Straight on and orthographic: an angled
// view shows the underside of the canopy and reads as a solid object, while this
// gives the flat silhouette a billboard wants. Returns the texture and the
// model's real size in metres, which sizes the card.
export function renderTreeSprite(build,{width=192,height=288}={}){
 let renderer=null;
 try{
  const canvas=document.createElement('canvas');
  renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(1);
  renderer.setSize(width,height,false);
  renderer.setClearColor(0,0);
  const scene=new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff,0x2b3d2b,1.7));
  const sun=new THREE.DirectionalLight(0xffffff,2.3);
  sun.position.set(5,9,12);
  scene.add(sun);
  const model=build();
  scene.add(model);
  const box=new THREE.Box3().setFromObject(model);
  const size=box.getSize(new THREE.Vector3());
  const centre=box.getCenter(new THREE.Vector3());
  const aspect=width/height;
  const halfHeight=Math.max(size.y*.52,size.x*.52/aspect)*1.02;
  const halfWidth=halfHeight*aspect;
  const camera=new THREE.OrthographicCamera(-halfWidth,halfWidth,halfHeight,-halfHeight,.1,size.y*8+40);
  camera.position.set(centre.x,centre.y,centre.z+size.y*4);
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
