# QuiverGL / QuiverMobile — Design and Techniques

**Current experimental implementation, 2026-10-09.** For the authoritative runtime values see `world.js`, `world-system.js` and `main.js`.

## Architecture and separation of authority
- **Three.js WebGL2** displays scenery and GLB avatars; **Box3D WASM** controls rigid-body motion; **Kotlin Android WebView** packages the same Vite assets used on desktop.
- `TerrainHeight.height(direction)` is the deterministic mathematical terrain authority. Rendered triangles are samples of it, **not** collision geometry or permanent world storage.
- `WorldSystem` owns the spatial index, implicit solid terrain and collision patch source. `PhysicsWorld` maintains Box3D dynamic bodies and a bounded changing set of static contact hulls.
- `PlayerSystem` controls input, player-relative heading and camera; `main.js` orchestrates frames.

## Scalable icosphere
Twenty D20 root faces recursively split into four triangles. Face directions are normalized radially, then displaced by the shared heightfield. The root edge is a parameter: **8192 m currently**, formerly 4096 m; neither is fixed. The target finest nominal edge is around 1 m and the needed LOD count derives from log2(root edge) (currently 13). The collision/octree extent must also grow with the planet and maximum possible relief.

## Layered geography
Seeded 3D value noise is sampled on the unit sphere so wavelength and amplitude scale with planet radius. Very broad layers establish ocean basins and highlands. A smooth elevation gate activates foothill hills, mountain ridges, detail and crevices without feeding fine noise back into its own biome classification. Radial height remains bounded away from the planet center. Sea level is a separate fixed `RADIUS - 1 m` datum, not an automatically recomputed water percentage.

## Terrain LOD and seam handling
The visible tree retains recursive nodes and chooses current leaves from player distance, face reach, zoom-specific maximum detail, and 20% hysteresis on collapse. This experiment uses 20 m successive near-player distance bands. Neighbor edge midpoints are recursively inserted into coarser leaf triangle boundaries so coarse and fine leaves share boundary vertices, rather than using geometry skirts.

When topology changes, the previous mesh briefly stays as a ghost. Complementary screen-door (dither) masks progressively reveal the new mesh while both write depth so translucent water does not paint over land. The ghost is removed and disposed after 0.35 seconds. The vertex shader additionally blends new sample positions from a parent-triangle plane toward their full heightfield positions as a function of player distance. This morph is visual; avoid deriving physics from it. Current morphing and mixed-edge behavior are subject to visual regression testing, particularly after changing planet dimensions.

## Solid octree and local physics
The implicit octree tests occupied static cells mathematically against a shared radial solid boundary and exposes queries without constructing a global set of cube objects. A separate local `SphereSurface` query constructs outward-facing thin Box3D hull patches near player and demo cubes. `PhysicsWorld.syncStatic` caches nearby regions and adds new support before retiring stale contact bodies. This prevents distant static geometry from becoming thousands of Box3D actors. Frame gravity points toward the planet center. The capsule uses real contact resolution, not renderer raycasts.

## Water and swimming
The water mesh is a transparent animated sea-level icosphere; no underwater fog. Water occupies open space above submerged ground. A capsule submerged fraction controls buoyancy and radial drag; forward input and camera pitch permit diving. Ocean rendering and shore-edge masking are areas for further validation, particularly with terrain fade transitions.

## Camera and globe navigation
A player-local tangent frame is parallel transported across the spherical world to preserve heading independently of any fixed geographic pole. Camera distance follows a log-scaled vertical slider; orientation lerps from third-person chase toward outward-radial globe overhead. Movement remains player-relative at any scale. Near clipping starts at 1 m and increases at large camera altitude to improve depth precision, while planet-scale zoom caps fine terrain subdivision.

## Intentional boundaries
Current experience is a diagnostic engine prototype, not a finished planet renderer. Some design notes in `prototype-architecture.md` describe earlier historical milestones, not present implementation. Do not reinstate old constants or pretend older static-planet notes are active requirements.
