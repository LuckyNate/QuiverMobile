# Unified Octree Collision Engine (standalone module)

`src/engine/world-octree.js` is independent of the current app, renderer and old prototype.

- **One spatial index:** static world, terrain triangles, player and dynamic bodies all have stable IDs and AABBs in the same world-coordinate octree.
- **Terrain:** triangles retain vertices and occupy their geometric AABB for broad-phase spatial queries. Their AABB is **not** falsely treated as a solid rectangular volume. Narrow-phase must test the actual triangle.
- **Other static solids:** authored or generated AABB primitives are registered as occupied boxes; boxes belonging to the *same owner* can merge only if the union is itself one rectangular volume.
- **Moving occupants:** insert/update/remove reindexes them in the same tree. Swept AABB broad phase returns candidates along a motion path.
- **Box3D boundary:** `physicsCandidates(dynamicId, proposedBounds)` produces only local occupants. The Box3D adapter must provide triangle narrow-phase or triangle contact proxies, manage contact bodies, and update the player/dynamic AABBs after each step.
- Octree queries accelerate detection; the octree is not itself the contact-response solver.
- No arbitrary test platform, camera-relative solidity, or fixed sideways-gravity frame is created.
- The app is **not yet connected** to this module; runtime integration and global dynamic gravity must be separately verified.

Run `node --test test/world-octree.test.js` from the `web` folder.
