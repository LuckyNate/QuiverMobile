import {WORLD_SCALE} from './world-config.js';
// Shared player-centered visibility policy for trees and future scenery.
// Render visibility must not alter simulation, persistence, or respawning.
export const SCENERY_VISIBILITY_METERS=Math.min(2500,WORLD_SCALE.diameter*2);
const SCENERY_VISIBILITY_SQUARED=SCENERY_VISIBILITY_METERS**2;
export function withinSceneryRange(position,avatarPosition){
 const dx=position.x-avatarPosition.x;
 const dy=position.y-avatarPosition.y;
 const dz=position.z-avatarPosition.z;
 return dx*dx+dy*dy+dz*dz<=SCENERY_VISIBILITY_SQUARED;
}
