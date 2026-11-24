// A creature's physical presence in Box3D. The body is kinematic: infinite mass, so
// the avatar and loose props are blocked by it and it is never pushed, sagged by
// gravity or knocked off its own feet. Authoring stays where it already is — the
// behaviour decides where the creature stands and this only tells physics where that
// is. The body is driven to its target by velocity rather than by a transform write,
// so Box3D sweeps it and a fast capsule cannot pass through in a single frame.
const MAX_SPEED=60;   // A teleport or a spawn is a follow, not a launch.

export class CreatureBody {
 constructor(world,creature,volume){
  this.world=world;
  this.creature=creature;
  this.id=creature.id;
  this.lift=volume.lift??0;
  const up=creature.at.clone().normalize();
  const position=creature.at.clone().addScaledVector(up,this.lift);
  this.body=world.world.createBody({type:'kinematic',
   position:{x:position.x,y:position.y,z:position.z},
   motionLocks:{angularX:true,angularY:true,angularZ:true}});
  // A sphere needs no rotation sync, which is why it is the default shape.
  if(volume.shape==='capsule')
   this.body.createCapsule({height:volume.height??0,radius:volume.radius,friction:.6});
  else this.body.createSphere({radius:volume.radius,friction:.6});
 }
 // Aim the body at where the creature now stands, in one frame's worth of motion.
 sync(dt){
  const at=this.creature.at,up=at.clone().normalize();
  const target=at.clone().addScaledVector(up,this.lift);
  const p=this.body.getPosition();
  const step=Math.max(1/240,dt);
  let x=(target.x-p.x)/step,y=(target.y-p.y)/step,z=(target.z-p.z)/step;
  const speed=Math.hypot(x,y,z);
  if(speed>MAX_SPEED){const k=MAX_SPEED/speed;x*=k;y*=k;z*=k;}
  this.body.setLinearVelocity({x,y,z});
  this.body.setAwake(true);
 }
 destroy(){this.body.destroy();}
}
