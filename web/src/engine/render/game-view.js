import * as THREE from 'three';
import {createDyePaletteTexture,dyeUV} from '../avatar/dye-palette.js';
import {WORLD_SCALE,WORLD_SETUP} from '../world/world-config.js';

// Renderer, scene, lighting and camera for the single WebGL viewport.
export class GameView {
 constructor({canvas,report}){
  this.canvas=canvas;
  this.renderer=null;
  try{
   this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
   if(!(this.renderer.getContext() instanceof WebGL2RenderingContext))throw new Error('WebGL2 is required');
   this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
   this.renderer.setClearColor(0x87ceeb);
   report('WebGL2','READY');
  }catch(error){report('WebGL2','FAILED',error.message);this.renderer=null;}
  this.scene=new THREE.Scene();
  // Shared tint lookup: dyes inventory and renderer sample the same fixed 8x8 RGB palette.
  this.scene.userData.dyePaletteTexture=createDyePaletteTexture();
  this.scene.userData.dyeUV=dyeUV;
  // Aerial haze as an always-on depth cue rather than a distant wall: it starts
  // at the camera, so it reads indoors and in the open, and it is complete at one
  // biome edge, so how far away something is can be judged at any range. Both
  // values derive from rootEdgeMeters, the edge of a D20 face, so the band stays
  // the same fraction of a biome if the planet is resized.
  this.scene.background=new THREE.Color(0x87ceeb);
  this.scene.fog=new THREE.Fog(0x87ceeb,0,WORLD_SETUP.rootEdgeMeters);
  this.scene.add(new THREE.HemisphereLight(0xeeeeff,0x263b55,2.1));
  const sun=new THREE.DirectionalLight(0xffffff,2.0);
  sun.position.set(90,180,70);
  this.scene.add(sun);
  this.camera=new THREE.PerspectiveCamera(55,1,1,WORLD_SCALE.cameraFarMeters);
  this.width=0;this.height=0;
 }
 // Match the drawing buffer to the CSS viewport once per frame when it changes.
 syncSize(){
  const width=this.canvas.clientWidth,height=this.canvas.clientHeight;
  if(width===this.width&&height===this.height)return;
  this.width=width;this.height=height;
  if(!this.renderer)return;
  this.renderer.setSize(width,height,false);
  this.camera.aspect=width/Math.max(1,height);
  this.camera.updateProjectionMatrix();
 }
}
