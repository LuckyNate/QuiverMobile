# QuiverMobile / QuiverGL — Current Engine Specification

**Status:** experimental working implementation, 2026-10-09. This document describes the current code, not a claim of production readiness.

## Purpose and platforms
A continuous spherical outdoor world engine. Three.js/WebGL2 and Box3D WebAssembly run in the same Vite-built JavaScript application on desktop browsers and the Android Kotlin WebView shell. Android packaging and signed APK updates use GitHub Actions. Native VR/OpenXR is a future direction, not currently implemented.

## World dimensions and levels of detail
- Twenty icosahedron (D20) root triangles, recursively subdivided into four children each.
- **Current experimental root edge: 256 m** (`WORLD_SETUP.rootEdgeMeters` in `web/src/engine/world-config.js`). **Not a fixed engine requirement.**
- Derived spherical base radius: `rootEdge * sqrt(10 + 2*sqrt(5)) / 4`.
- Finest subdivision level derives from `round(log2(rootEdge))`: currently **8** to target nominal 1 m edges. Both planet size and subdivision count are adjustable; they are not architectural constants.
- Current 20 m LOD bands are a tuning choice, not a universal rule. Near-player detail is selected by player-centered distance and stable chunk-address updates; the camera far range influences distant detail. The current `world.js` does not implement the older documented split hysteresis or zoom-specific detail caps.
- **Current renderer (2026-10-13):** leaf geometry attempts to conform coarse boundaries to the highest-detail touching render neighbor, with mixed-LOD seams still requiring device verification. Legacy 12 m skirts were removed. No shader height morph or dither/ghost fade is active.

## Geology, sea and solid ground
- One deterministic seeded radial `TerrainHeight` drives visible terrain, implicit solids, and local collision hulls. Current seed: `QuiverGL`.
- Planet-relative, layered 3D noise: broad continent/ocean relief plus progressively activated hills, ridges, crevices and fine detail. Roughness depends on broad elevation.
- Terrain radial height is `RADIUS + height(direction)`; visual meshes never define solidity.
- **Sea level remains `RADIUS - 1 m`**. Water is an animated transparent surface; buoyancy applies where the ground is below sea level. Water must not count as solid terrain.
- Player spawn samples deterministic dry terrain in the configured Meadows face (F06).

## Spatial index and physics
- Sparse `WorldOctree` indexes dynamic actor locations, and `ImplicitSphere` provides analytical static occupancy. Current 256 m edge configuration uses a derived 512 m octree half-width and maximum depth 10, retaining nominal 1 m octree cell resolution.
- `SphereSurface` generates 1 m local outward terrain hull patches from the same height provider. Only nearby patches are registered as static proxies with Box3D, never every triangle of the planet.
- Dynamic capsule and demonstration boxes use Box3D; the player follows radial gravity. The movement target is currently 10 m/s. Immersion adds upward buoyancy and vertical drag; forward while looking down contributes dive effort.
- Render geometry remains independent of Box3D's mathematical terrain and local contact hulls. The boundary adjustment is render-only and must not alter physics or water.

## Camera and controls
- Chase camera stays in a player-local, parallel-transported navigation frame, gradually becoming overhead at high zoom. Globe orientation is relative to player heading, not geographic poles.
- Vertical logarithmic zoom slider and mouse wheel cover 3 m through two world diameters; camera near clip remains 1 m and far clip is six diameters, derived from world setup.
- Terrain LOD responds to distance, while zoom and far clipping derive from the world-scale settings.

## Boundaries and ongoing validation
- Android is the primary device test. Validate startup and shoreline spawn, capsule contact, swimming, fixed seed, map-scale camera stability, water occlusion, globe clipping, mixed-LOD seam continuity, stable streaming, and preserved frame rate.
- Current code should not be described as implementing native C++, a native graphics backend, true per-pixel shoreline masking, a production geographic planet, or full VR.
- Any change to planet root edge requires auditing radius-derived noise, visible LOD depth, spatial bounds, physics sampling, and camera extent; do not treat a single numerical edit as the entire system.

## Fine-LOD-owned render boundaries (source implemented 2026-10-13; device validation pending)
- The highest-resolution render node touching a shared boundary defines its subdivision and sampled radial positions; the coarser neighbor conforms to those positions, not the reverse.
- Use the same recursively normalized midpoint construction as the D20 hierarchy and the same deterministic `TerrainHeight` sampling on both sides. Do not substitute normalized linear interpolation between edge endpoints, which can produce different intermediate positions.
- Split only coarser boundary edges as needed to match the finer neighbor; locally retriangulate the affected coarse border while keeping its interior at its selected LOD. Equal-LOD neighbors require no additional subdivision.
- Neighbor-aware edge configuration must be part of the geometry-cache identity or trigger targeted invalidation/rebuild when adjacent detail changes; cached seams must not become stale.
- Preserve player-centered LOD selection, incremental mesh creation, bounded cache/eviction, coarsest distant geometry outside `zFar`, and the currently high frame rate. The old 12 m skirts have been removed.
- The code has been changed, but cross-face/multi-level seams and performance have not yet been validated on device.

## LOD render coverage update (2026-10-13)
- `WorldTerrain` now begins with a complete 20-face coarse globe and retains the last fully available render generation while the next requested LOD set streams into the mesh cache.
- Staged meshes remain hidden until every target mesh is built; then visibility switches in one frame. Replaced targets never hide previously displayed coverage early. Both new and old meshes are protected from eviction while needed; the fallback globe is retained.
- `loadNear` now supplies the same seam configuration as ordinary streaming. Boundary cache signatures encode actual inserted vertex positions instead of neighboring node IDs.
- This specifically addresses transient **missing coverage** during one-mesh-per-frame replacement; it is separate from the still-unverified geometric crack stitching. The all-ready staging policy can delay presentation of new LOD detail for large target sets; Android frame rate, memory usage, and seam continuity need observation.

## Quiver Mobile title-screen startup (2026-10-13)
The game starts rendering and initializing behind a full-screen `QUIVER MOBILE` title. The title displays live readiness for WebGL, world/water, the full initial requested LOD generation, scenery, player/Box3D, and a successfully rendered frame. `START GAME` appears only when those requirements are ready and no reported initialization failures remain. The title is not automatically dismissed; starting removes the overlay and unlocks player input and the Admin/Inventory panels. Until then, movement, look, zoom, and swim input are disabled while the simulation and geometry streaming continue. Errors remain visible on the title screen and block Start. This is a readiness gate, not an artificial timer, and it does not change terrain selection, collision or rendering algorithms. Android startup behavior remains to be validated.

## Animated block avatar integration (2026-10-13)
- The standalone `assets/models/debug/quiver_block_avatar.glb` is now copied to the Vite public models directory in the Android build and loaded by `web/src/player-avatar.js` using Three.js GLTFLoader.
- The existing translucent procedural capsule remains in the avatar scene graph, and the separate Box3D player capsule retains all collision, movement, and contact authority. The new model is a visual child, not a replacement collider.
- The built-in `Idle` and looping `Walking` clips are driven by the existing PlayerSystem animation requests and a delta-time AnimationMixer. Unsupported animation requests fall back to Idle.
- The Quiver Mobile startup gate waits for `GLB player: READY` before offering Start Game. A load failure is reported and blocks entry rather than silently hiding it.
- Runtime display, animation playback, and Android build remain unverified.


## World object architecture (2026-10-13)
- **Protected core:** `world.js` terrain geometry/LOD, `terrain-height.js`, `world-system.js` solidity, `physics.js` Box3D integration, and player capsule must not be modified by resource-system changes.
- `engine/world-object.js` defines stable object ID, type, position, mutable state, and serializable snapshot.
- `engine/resource.js` extends WorldObject with required tool, yield and contact-eligibility policy.
- `engine/tree.js` extends Resource: trees accept axe contact on trunk, branches and foliage; without axe they are scenery.
- `engine/object-registry.js` indexes live objects by stable ID. Duplicate IDs are rejected.
- `engine/resource-density.js` defines configurable seeded densities in expected resources/km². `engine/resource-distributor.js` generates deterministic per-cell candidates without reading render triangles.
- `engine/tree-population.js` queries read-only terrain heights for current Meadows resource candidates and handles replacements. Existing pre-seeded test quotas have been removed from active tree placement. Distribution outside the four Meadows starter cells is not yet implemented.
- `engine/tree-visual.js` owns mesh creation; `engine/tree-contact.js` owns axe-gated contact against the already-existing Box3D player body; `engine/tree-lifecycle.js` owns falling, fading, flying, collection and save-state updates.
- `trees.js` is the coordinating adapter between these classes and `SharedWorld`. No new terrain or physics engine is introduced.
- Existing debug tree geometry remains the visual representation pending separately approved art/assets. Contact is currently a velocity-response adapter acting on the Box3D body, **not registered Box3D tree fixtures**; full physical tree body conversion remains open.
- Preserve stable IDs and saved entity records while transitioning population rules. Verify Android workflow and runtime before calling the migration validated.

### Additional OOP contracts
- `engine/biome.js`: classifies one of the existing 20 D20 biome IDs by name/density parameters; does not alter terrain classification.
- `engine/rock.js`, `engine/mineral-deposit.js`: tool-gated pick resources, defined but not yet spawned.
- `engine/structure.js`: player-owned persistent built object contract; no construction runtime connected yet.
- `engine/environmental-object.js`: noninteractive visual world object.
- `engine/world-object-manager.js`: wraps the registry with spawn, lookup, state mutation and despawn.
- `engine/tool-registry.js` and `engine/interaction-system.js`: central tool/resource permission checks; currently wired to live tree contact.
- All new class definitions have one-class-per-commit histories. Wiring commits are separate and limited to direct consumers.
- Remaining work: streamed resource cells outside the Meadows starter neighborhood; migrate rocks/structures into live rendering/interaction; replace manual tree velocity response with integrated Box3D resource fixtures if desired. Current commits have not been verified by an on-device interaction test.

### Biome-owned resource streaming (2026-10-13)
- `engine/resource-handler.js` extends the existing tree gameplay adapter into the live world resource entry point; `main.js` starts one handler with read-only D20 roots from `WorldTerrain`.
- `engine/biome-resource-zone.js` owns a fixed 32 m tangent-plane cell grid for each of the 20 D20 faces. Resources are requested in a bounded 5×5 cell neighborhood near the avatar and unloaded behind the player; at most one new cell is populated per biome per frame. It samples terrain elevation without modifying terrain meshes, seed, or LOD.
- Each biome owns a configurable resource-density profile in `web/src/engine/world-config.js`. In the current prototype F06 Meadows alone generates trees, grass, sticks and stones; the nineteen other faces are empty and distinctly colored. The biome contents remain provisional. The player's actual starting face is labeled Meadows. Other profiles can be supplied through the resource handler constructor.
- `engine/resource-type-registry.js` maps resource types to explicit spawn/unload adapters. Trees are registered. Rocks and mineral deposits have object contracts but no live rendering or harvesting adapters, so zones skip those types until installed.
- Resource instance IDs include D20 face, resource type, cell coordinate and candidate ordinal, stable across LOD and reload. `SharedWorld` harvest records are respected; harvested resources are not recreated when a cell reloads.
- The legacy Meadows-only four-cell population loop is disabled in the active `ResourceHandler`; its tree contact and collection logic are retained.
- Resource loading/unloading is independent of terrain, Box3D, and camera range. Android build and on-device interaction testing remain separate verification gates.
