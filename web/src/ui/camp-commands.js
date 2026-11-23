import {requestCampTeleport} from '../engine/camp-respawn.js';

// Owner console command for dying at the most recently used camp.
export function registerCampRespawnCommand(console,{sharedWorld,playerId}){
 console.registerCommand('die',()=>{
  const saved=sharedWorld.getEntity('camp:respawn:'+playerId);
  if(!saved?.position)return 'No camp yet: build a bonfire first';
  if(!requestCampTeleport({x:saved.position[0],y:saved.position[1],z:saved.position[2]}))return 'Could not respawn';
  return 'Respawning at camp';
 },'Die and respawn at your most recent camp or bonfire');
}
