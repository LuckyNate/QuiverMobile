// Camp respawn handoff. The bonfire stores the safe standing spot, the owner
// console queues a respawn, and the physics step applies it to the capsule.
// Explicit calls only: nothing here runs on a timer or polls the world.
let pending = null;

export function requestCampTeleport(position) {
 if (!position) return false;
 pending = {x: position.x, y: position.y, z: position.z};
 return true;
}

export function pendingCampTeleport() {
 return pending;
}

export function takeCampTeleport() {
 const target = pending;
 pending = null;
 return target;
}
