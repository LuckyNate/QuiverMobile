# QuiverMobile / QuiverGL — Current Engine Specification

**Status:** experimental working implementation, 2026-10-09. This document describes the current code, not a claim of production readiness.

## Purpose and platforms
A continuous spherical outdoor world engine. Three.js/WebGL2 and Box3D WebAssembly run in the same Vite-built JavaScript application on desktop browsers and the Android Kotlin WebView shell. Android packaging and signed APK updates use GitHub Actions. Native VR/OpenXR is a future direction, not currently implemented.

## World dimensions and levels of detail
- Twenty icosahedron (D20) root triangles, recursively subdivided into four children each.
- **Current experimental root edge: 8192 m** (`ROOT_EDGE_METERS` in `web/src/world.js`). **Not a fixed engine requirement.**
- Derived spherical base radius: `rootEdge * sqrt(10 + 2*sqrt(5)) / 4`.
- Finest subdivision level derives from `round(log2(rootEdge))`: currently **13** to target nominal 1 m edges. Both planet size and subdivision count are adjustable; they are not architectural constants.
- Current 20 m LOD bands are a tuning choice, not a universal rule. Near-player detail is selected by player-centered distance and stable chunk-address updates; the camera far range influences distant detail. The current `world.js` does not implement the older documented split hysteresis or zoom-specific detail caps.
- **Current renderer (2026-10-13):** leaf geometry conforms coarse boundaries to the highest-detail touching render neighbor. Legacy 12 m skirts were removed. No shader height morph or dither/ghost fade is active.

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
- Render geometry remains independent of Box3D's mathematical terrain and local contact hulls. The boundary adjustment is render-only and must not alter physics or water.

## Camera and controls
- Chase camera stays in a player-local, parallel-transported navigation frame, gradually becoming overhead at high zoom. Globe orientation is relative to player heading, not geographic poles.
- Vertical logarithmic zoom slider and mouse wheel cover 3–30000 m. The camera near plane has a 1 m minimum and rises with camera altitude; far plane is currently 60000 m.
- Above approximately 500 / 1500 / 5000 m zoom, render LOD detail is capped at 8 / 5 / 3 respectively. These are current experimental thresholds.

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
