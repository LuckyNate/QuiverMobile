# QuiverMobile prototype architecture — baseline lock

Status: **working-prototype boundary**, 2026-10-09. Preserve existing walking/contact behavior before subsequent terrain deformation.

## Ownership

- **World** (`web/src/world-system.js`): planet spatial index, immutable implicit solidity at 1 m cells, local outward-facing Box3D patch source. World-wide position/normal is radial, radius 1024 m.
- **Player** (`web/src/player.js`): Android-touch/keyboard controls, yaw/pitch/zoom camera, visual GLB capsule and local movement vector. Actual capsule body remains owned by `PhysicsWorld`.
- **Solidity** (`web/src/engine/implicit-sphere.js`, `sphere-surface.js`, `physics.js`): mathematical occupancy and local static Box3D collision hulls. Never derive contact from visible triangles or water. Physics gravity is radial.
- **Terrain** (`web/src/world.js`): visible gray icosphere; currently fixed-radius and not deformed.
- **Water** (`web/src/water.js`): independent blue icosphere at radius 1023 m (terrain radius - 1 m). Currently purely visual and below the land, so it may be occluded everywhere. Its radius is configurable; it has no physics.

`main.js` orchestrates setup, debug meshes, physics update and rendering; this is intentionally a limited extraction to protect working gameplay.

## Locked baseline invariants

1. Player uses exactly the existing Box3D capsule, with no extra sled/step boost.
2. Green outward-facing collision hulls remain authoritative for actual contact and are not drawn.
3. Cyan solidity and magenta gravity diagnostics remain hidden. Gray terrain is the visible land.
4. The implicit octree remains sparse, 1 m minimum surface cell size, and the physics region is populated near dynamic bodies.
5. Gravity remains radial and independent of rendered geometry.
6. Water is a separate concentric mesh, **not solid** and does not modify terrain or gravity.
7. Initial terrain height offset is zero. Do not introduce displacement, buoyancy, swimming or new collision rules as part of this baseline.
8. Do not change any of these invariants without a separate agreed scope and verified build/runtime regression checks.

## Future terrain deformation contract (not implemented)

Introduce one shared radial height provider `height(direction)` to displace visible terrain and solid collision surface together; leave sea level fixed at configurable `water.radius`. Above sea level is land, below it water will be visible. Define surface query/collider rebuild and LOD handling before implementing deformation. Never silently let graphics and physics diverge.

## Regression checks

Android release build succeeds; startup reaches Box3D READY; player spawns on land and walks smoothly; falling boxes contact local solid surface; turning, zoom and camera track as before; debug colors stay hidden; water remains a separate mesh and does not intercept collisions.
