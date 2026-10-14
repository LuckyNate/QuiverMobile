import * as THREE from 'three';
import System, {
  Emitter, SpriteRenderer, Rate, Span, Body, Mass, Radius, Life,
  Position, SphereZone, RadialVelocity, Vector3D, Alpha, Scale, Color
} from 'three-nebula';

// The game's bonfire preset uses the maintained Three Nebula emitter and renderer.
// Sprite particles automatically face the camera, with no custom shaders or normals.
export class VoxelFireEmitter {
 constructor(){
  this.group=new THREE.Group();
  this.system=new System();
  this.system.addRenderer(new SpriteRenderer(this.group,THREE));
  const square=new THREE.Sprite(new THREE.SpriteMaterial({
   color:0xffffff,transparent:true,depthWrite:false,depthTest:true
  }));
  const make=(rate,interval,life,radius,speed,spread,colors)=>{
   const emitter=new Emitter();
   emitter.setRate(new Rate(new Span(rate*.85,rate*1.15),new Span(interval)))
    .setInitializers([
     new Body(square),
     new Mass(1),
     new Radius(new Span(radius*.65,radius*1.35)),
     new Life(new Span(life*.7,life*1.3)),
     new Position(new SphereZone(.6)),
     new RadialVelocity(new Span(speed*.7,speed*1.3),new Vector3D(0,1,0),spread)
    ])
    .setBehaviours([
     new Alpha(1,0),
     new Scale(1,.15),
     new Color(new THREE.Color(colors[0]),new THREE.Color(colors[1]))
    ]);
   this.system.addEmitter(emitter);
   return emitter;
  };
  // Separate full-bodied flames from smaller, long-lived sparks.
  this.emitters=[
   make(8,.045,2.1,.36,2.0,27,[0xffdb52,0xff3308]),
   make(3,.14,2.8,.14,2.1,22,[0xffe780,0xff7e0b])
  ];
  this.enabled=false;
  this.group.visible=false;
  this.lastTime=null;
 }
 setEnabled(enabled){
  const active=Boolean(enabled);
  if(active===this.enabled)return;
  this.enabled=active;
  this.group.visible=active;
  for(const emitter of this.emitters){
   if(active)emitter.emit();
   else{emitter.stopEmit();emitter.removeAllParticles();}
  }
  this.lastTime=null;
 }
 update(time){
  if(!this.enabled)return;
  const dt=this.lastTime===null?1/60:THREE.MathUtils.clamp(time-this.lastTime,0,.05);
  this.lastTime=time;
  this.system.tick(dt);
 }
 dispose(){
  this.setEnabled(false);
  this.system.destroy();
 }
}
