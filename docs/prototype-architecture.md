# QuiverMobile prototype architecture — baseline lock

Status: **working-prototype boundary**, 2026-10-09. Preserve existing walking/contact behavior before subsequent terrain deformation.

## Ownership

- **World** (`web/src/world-system.js`): planet spatial index, immutable implicit solidity at 1 m cells, local outward-facing Box3D patch source. World-wide position/normal is radial, radius derived from the 4096 m D20 root edge (approximately 3895.9 m).
- **Player** (`web/src/player.js`): Android-touch/keyboard controls, yaw/pitch/zoom camera, visual GLB capsule and local movement vector. Actual capsule body remains owned by `PhysicsWorld`.
- **Solidity** (`web/src/engine/implicit-sphere.js`, `sphere-surface.js`, `physics.js`): mathematical occupancy and local static Box3D collision hulls. Never derive contact from visible triangles or water. Physics gravity is radial.
- **Terrain** (`web/src/world.js`): visible gray icosphere; currently fixed-radius and not deformed.
- **Water** (`web/src/water.js`): independent blue icosphere at radius RADIUS - 1 m (terrain radius - 1 m). Currently purely visual and below the land, so it may be occluded everywhere. Its radius is configurable; it has no physics.

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

## Terrain LOD baseline (2026-10-09)

- `WorldTerrain` uses 20 root icosahedron triangles and a persistent 4-child subdivision hierarchy.
- Near-camera leaves subdivide to level 10; distant leaves stay coarse. Split distances are set by `LOD_MAX_DISTANCE_METERS` in `world.js`, with 20% hysteresis on merging.
- Only current leaf triangles are drawn. Geometry is rebuilt only when the leaf set changes; child nodes are retained across movement.
- Render-only radial skirts cover mixed-level triangle edges; skirts do not modify the analytical planet, Box3D or water.
- The terrain remains a constant-radius gray sphere. No displacement/noise is enabled. Local solidity and Box3D patch generation are unchanged and independent from render LOD.
- Verify smooth walking, no gaps while walking across LOD boundaries, absence of noisy continuous rebuilds, and APK launch before any deformation changes.

## Deterministic terrain seed (2026-10-09)

- `TerrainHeight` in `web/src/engine/terrain-height.js` is the single height authority for rendered LOD vertices, implicit occupancy and Box3D surface patch vertices. Default fixed text seed: `QuiverGL`.
- Every string, **including the empty string** `""`, hashes deterministically via FNV-1a over UTF-8 bytes. No random fallback or implicit seed generation. Identical string produces identical world.
- Continuous seeded 3D value noise at 512/128/32 m wavelengths with 24/8/2 m nominal amplitude; conservative maximum radial displacement of ±34 m.
- Water remains fixed at RADIUS - 1 m. Player starts 1.3 m above the procedural radius at spawn.
- Current collision uses 1 m cube-sphere sampling while visible triangle LOD is independent; small interpolation mismatches can exist. Verify contact on slopes in-device before considering this production-perfect.

## Development planet scale — accepted target (2026-10-09)

- Authoritative root icosahedron edge: **4096 meters = 2^12 meters**; radius is derived as `ROOT_EDGE_METERS * sqrt(10 + 2*sqrt(5)) / 4`.
- Subdivision level 12 targets **1 m nominal original-face edge length** (4096 / 2^12); radial re-normalization means actual triangle edges vary somewhat.
- Terrain renderer LOD maximum 12. Existing neighbor-edge stitching and hysteresis remain in place; configured split ranges scale with the larger planet.
- Spatial and implicit-octree half-width: 4096 m, covering the entire planet and its ±34 m height offsets; dynamic octree max depth 13 permits 1 m cells across an 8192 m root cube.
- Water follows RADIUS - 1 m; seed and noise wavelengths remain unchanged for this development-stage size increase. No player, Box3D contact, or gravity behavior changes.

## Elevation-dependent biome shaping (2026-10-09)

- The same seeded radial `TerrainHeight.height(direction)` continues to drive LOD rendering, implicit solidity and local Box3D collision patches. Any string including `""` remains a valid deterministic seed.
- Broad geographic elevation uses 1800 m and 650 m wavelengths (245 m and 100 m amplitudes, respectively). This underlying elevation is sampled **first** and controls roughness bands, avoiding a feedback loop from small-scale detail.
- Near sea level: weak 240 m plains texture (1.5 m amplitude). Foothills: progressively enabled 140 m hills (14 m). Highlands: stronger 32 m fine detail (up to 4 m). Mountains: ridges (up to 38 m at 95 m wavelength) and narrow crevices (up to 30 m depth at 42 m wavelength).
- Smoothstep blends over elevation bands prevent hard biome edges. No separate biome lookup or stateful noise is used.
- `TERRAIN_AMPLITUDE=440` is a conservative bound used by octree occupancy and local surface search. The octree root half-width is expanded to 8192 m (14 levels for 1 m resolution) to cover mountain elevations without truncating the world.
- Water remains RADIUS - 1 m and physics, input and LOD selection remain unchanged. On-device slope/contact and performance validation are required.
