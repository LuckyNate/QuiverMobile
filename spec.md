# QuiverMobile / QuiverGL — Current Engine Specification

**Status:** experimental working implementation, 2026-10-09. This document describes the current code, not a claim of production readiness.

## Purpose and platforms
A continuous spherical outdoor world engine. Three.js/WebGL2 and Box3D WebAssembly run in the same Vite-built JavaScript application on desktop browsers and the Android Kotlin WebView shell. Android packaging and signed APK updates use GitHub Actions. Native VR/OpenXR is a future direction, not currently implemented.

## World dimensions and levels of detail
- Twenty icosahedron (D20) root triangles, recursively subdivided into four children each.
- **Current experimental root edge: 8192 m** (`ROOT_EDGE_METERS` in `web/src/world.js`). **Not a fixed engine requirement.**
- Derived spherical base radius: `rootEdge * sqrt(10 + 2*sqrt(5)) / 4`.
- Finest subdivision level derives from `round(log2(rootEdge))`: currently **13** to target nominal 1 m edges. Both planet size and subdivision count are adjustable; they are not architectural constants.
- Current 20 m LOD bands are a tuning choice, not a universal rule. Near-player detail is selected by distance with split hysteresis; far zoom limits maximum active detail.
- Render leaves stitch vertices along unequal-level boundaries. Detail is morphed toward sampled height in the vertex shader, with a complementary dither fade between topology replacements. These are experimental rendering techniques requiring on-device visual checks.

## Geology, sea and solid ground
- One deterministic seeded radial `TerrainHeight` drives visible terrain, implicit solids, and local collision hulls. Current seed: `QuiverGL`.
- Planet-relative, layered 3D noise: broad continent/ocean relief plus progressively activated hills, ridges, crevices and fine detail. Roughness depends on broad elevation.
- Terrain radial height is `RADIUS + height(direction)`; visual meshes never define solidity.
- **Sea level remains `RADIUS - 1 m`**. Water is an animated transparent surface; buoyancy applies where the ground is below sea level. Water must not count as solid terrain.
- Player spawn samples a deterministic near-zero-elevation dry shoreline near water.

## Spatial index and physics
- Sparse `WorldOctree` indexes dynamic actor locations, and `ImplicitSphere` provides analytical static occupancy. Current 8192 m edge configuration uses a 16384 m octree half-width and maximum depth 15, retaining nominal 1 m octree cell resolution.
- `SphereSurface` generates 1 m local outward terrain hull patches from the same height provider. Only nearby patches are registered as static proxies with Box3D, never every triangle of the planet.
- Dynamic capsule and demonstration boxes use Box3D; the player follows radial gravity. The movement target is currently 10 m/s. Immersion adds upward buoyancy and vertical drag; forward while looking down contributes dive effort.
- Terrain LOD morphing is **render-only**. Box3D uses un-morphed mathematical terrain; visual and contact surfaces may temporarily differ.

## Camera and controls
- Chase camera stays in a player-local, parallel-transported navigation frame, gradually becoming overhead at high zoom. Globe orientation is relative to player heading, not geographic poles.
- Vertical logarithmic zoom slider and mouse wheel cover 3–30000 m. The camera near plane has a 1 m minimum and rises with camera altitude; far plane is currently 60000 m.
- Above approximately 500 / 1500 / 5000 m zoom, render LOD detail is capped at 8 / 5 / 3 respectively. These are current experimental thresholds.

## Boundaries and ongoing validation
- Android is the primary device test. Validate startup and shoreline spawn, capsule contact, swimming, fixed seed, map-scale camera stability, water occlusion, globe clipping, seam stitching, and LOD morph/fade.
- Current code should not be described as implementing native C++, a native graphics backend, true per-pixel shoreline masking, a production geographic planet, or full VR.
- Any change to planet root edge requires auditing radius-derived noise, visible LOD depth, spatial bounds, physics sampling, and camera extent; do not treat a single numerical edit as the entire system.
