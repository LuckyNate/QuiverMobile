// Camp rest ownership: near the fire and not moving is resting, and any
// moment of rest makes that camp the respawn point. Visual only for the body.
export class CampRest {
 constructor({shared,player,playerId}){
  this.shared=shared;this.player=player;this.playerId=playerId;this.wasResting=false;
 }
 saveAt(position){
  this.shared.setEntity('camp:respawn:'+this.playerId,
   {state:'camp',position:position.toArray(),ownerId:this.playerId});
 }
 update(near){
  const resting=near&&!this.player.isMoving;
  this.player.setResting?.(resting);
  if(resting&&!this.wasResting)this.saveAt(this.player.position);
  this.wasResting=resting;
  return resting;
 }
 clear(){
  this.player.setResting?.(false);
  this.wasResting=false;
 }
}
