# QuiverMobile — Development and Tuning Notes

## Toolchain and builds
Node 22+, Vite, Three.js/WebGL2, box3d-wasm, Gradle, Android Kotlin WebView. Desktop: `cd web && npm install && npm run dev`. CI runs the Vite build, copies `web/dist` into Android app assets, signs a release APK and publishes updates. WebViewAssetLoader hosts bundled assets under `https://appassets.androidplatform.net/assets/web/`, not `file://`.

## Implementation map
- `web/src/world.js` — D20 root size/radius, terrain LOD tree, stitching, vertex morph attributes, screen-door fade, palette.
- `web/src/engine/terrain-height.js` — seeded, unit-sphere layered radial elevation authority.
- `web/src/world-system.js` and `engine/world-octree.js` — spatial extent, actor indexing.
- `engine/implicit-sphere.js` and `engine/sphere-surface.js` — sparse static occupancy and outward 1 m collision hulls.
- `web/src/physics.js` — Box3D fixed timestep, radial gravity, player capsule, contact proxy synchronization.
- `web/src/water.js` — fixed sea level at base radius minus 1 m and animated transparent water mesh; immersion query.
- `web/src/player.js` — touch/keyboard, player-local heading, camera, logarithmic zoom slider and dive inputs.
- `web/src/main.js` — deterministic shoreline spawn, physics frame, camera clipping, globe LOD caps.

## Current scale (experimental, not invariant)
`ROOT_EDGE_METERS = 8192`. Base radius derives from it; `MAX_TERRAIN_LOD = round(log2(ROOT_EDGE_METERS))` gives 13 for nominal finest 1 m original-face edges. LOD thresholds descend in 20 m increments; transitions use 20% split hysteresis and 0.35 s ghost fade. Octree current half-width 16384 m, maxDepth 15, `minCell=1` for implicit queries; all are scale-dependent. When testing another root size, recalculate derived radius, maximum elevation bound, octree bounds/depth, LOD range, camera and shoreline spawn. Do not freeze 8192 m or 13 levels into a permanent engine contract.

## Tests and regression checks
1. Startup completes to Box3D READY; a dry shoreline spawn has actual nearby water.
2. Player remains physically supported by solid ground while moving at 10 m/s; local contact hull streaming does not stall frames.
3. Water remains occluded by dry ground through terrain LOD changes, and the underwater camera does not reintroduce fog.
4. Nearby LOD subdivides without holes, misplaced morph origins, flickering fade, disappearing terrain, or visible abrupt unfolding.
5. When zoomed out to the upper slider region, cap fine LOD, ensure whole-world visibility and check depth-buffer precision, z-fighting and player-relative map heading.
6. Signed Android build succeeds, but a successful build alone does not verify in-device rendering or gameplay behavior.

## Known limitations
- GPU morph positions and mathematical Box3D contact surface can differ temporarily during LOD transitions.
- Fine edge stitching and morph geometry require targeted mixed-LOD inspection.
- Transparent water and the old/new terrain fade must both respect depth.
- No native VR backend, production coordinate rebasing, horizon-based frustum culling, or robust planet-size automated benchmark is claimed.
- `docs/prototype-architecture.md` is a historical baseline and may contain outdated constants.

## Repository workflow
Follow `reporules.md`: negotiate scope, minimize touched files, obtain approval for code or documentation writes, and distinguish build verification from real device behavior.
