# QuiverMobile — Development and Tuning Notes

## Toolchain and builds
Node 22+, Vite, Three.js/WebGL2, box3d-wasm, Gradle, Android Kotlin WebView. Desktop: `cd web && npm install && npm run dev`. CI runs the Vite build, copies `web/dist` into Android app assets, signs a release APK and publishes updates. WebViewAssetLoader hosts bundled assets under `https://appassets.androidplatform.net/assets/web/`, not `file://`.

## Implementation map
- `web/src/world.js` — D20 root size/radius, terrain LOD selection, independent leaf mesh generation, neighbor-aware conforming coarse edges, streamed mesh cache, palette.
- `web/src/engine/terrain-height.js` — seeded, unit-sphere layered radial elevation authority.
- `web/src/world-system.js` and `engine/world-octree.js` — spatial extent, actor indexing.
- `engine/implicit-sphere.js` and `engine/sphere-surface.js` — sparse static occupancy and outward 1 m collision hulls.
- `web/src/physics.js` — Box3D fixed timestep, radial gravity, player capsule, contact proxy synchronization.
- `web/src/water.js` — fixed sea level at base radius minus 1 m and animated transparent water mesh; immersion query.
- `web/src/player.js` — touch/keyboard, player-local heading, camera, logarithmic zoom slider and dive inputs.
- `web/src/main.js` — deterministic shoreline spawn, physics frame, camera clipping, globe LOD caps.

## Current scale (experimental, not invariant)
`ROOT_EDGE_METERS = 8192`. Base radius derives from it; `MAX_TERRAIN_LOD = round(log2(ROOT_EDGE_METERS))` gives 13 for nominal finest 1 m original-face edges. Current `world.js` selects detail by player distance and node footprint with logarithmic falloff, updating the required mesh set on stable anchor changes; it does not implement the previously documented 20 m bands, 20% split hysteresis, or 0.35 s ghost fade. Octree current half-width 16384 m, maxDepth 15, `minCell=1` for implicit queries; all are scale-dependent. When testing another root size, recalculate derived radius, maximum elevation bound, octree bounds/depth, LOD range, camera and shoreline spawn. Do not freeze 8192 m or 13 levels into a permanent engine contract.

## Tests and regression checks
1. Startup completes to Box3D READY; a dry shoreline spawn has actual nearby water.
2. Player remains physically supported by solid ground while moving at 10 m/s; local contact hull streaming does not stall frames.
3. Water remains occluded by dry ground through terrain LOD changes, and the underwater camera does not reintroduce fog.
4. Nearby LOD subdivides without gaps, T junctions, stale boundary variants, disappearing terrain, excessive rebuilds, or abrupt visible changes.
5. When zoomed out to the upper slider region, cap fine LOD, ensure whole-world visibility and check depth-buffer precision, z-fighting and player-relative map heading.
6. Signed Android build succeeds, but a successful build alone does not verify in-device rendering or gameplay behavior.

## Known limitations
- Visual mesh sampling and Box3D contact surface remain separate; render-only edge conformance must not modify physics.
- Mixed-LOD coarse edges now conform to fine neighbors using identical normalized-midpoint positions and sampled heights; old 12 m skirts were removed. Device validation remains pending.
- Neighbor-dependent geometry needs a suitable cache key or targeted invalidation; preserve one-mesh-per-frame streaming and the observed high frame rate.
- Transparent water and replacement terrain must respect depth; no old/new terrain ghost fade exists in current `world.js`.
- No native VR backend, production coordinate rebasing, horizon-based frustum culling, or robust planet-size automated benchmark is claimed.
- `docs/prototype-architecture.md` is a historical baseline and may contain outdated constants.

## Repository workflow
Follow `reporules.md`: negotiate scope, minimize touched files, obtain approval for code or documentation writes, and distinguish build verification from real device behavior.

## Renderer boundary ownership (implemented in source; unverified on device)
The finer adjacent render node is authoritative for every shared edge. Its recursively normalized midpoint subdivision and `TerrainHeight`-sampled vertex positions must be mirrored on the coarse side. Refine and triangulate only the impacted coarse border, not the coarse interior or whole planet. Identify mixed-LOD neighboring nodes (including across D20 root faces), encode the edge configuration in cached geometry or invalidate affected entries on neighbor changes, and avoid T junctions and visible cracks. The old 12 m skirts were removed. This is implemented in `world.js`, but runtime and performance verification remain outstanding. World selection, player-relative updates, Box3D, and water were not changed by this renderer edit.

## 2026-10-13 terrain coverage repair
- Diagnosed immediate hiding of old required meshes while replacements were constructed at one mesh per frame; this created transient holes regardless of correct seam geometry.
- Added full 20-face low-detail fallback coverage and staged generation swaps. The previous complete set stays displayed while requested meshes build invisibly; visibility changes only once all new target meshes exist.
- Displayed meshes are not evicted, and `loadNear()` uses the precomputed seam variants. Cache signatures now use actual boundary positions, not neighbor IDs.
- The previous high frame rate is an observed baseline, **not** a verified result of this edit. Atomic full-set swaps may delay new-detail exposure when many meshes are queued. Verify Android startup, movement, convergence, memory, seams, and terrain coverage before treating the fix as complete.

## Quiver Mobile title-screen startup (2026-10-13)
The game starts rendering and initializing behind a full-screen `QUIVER MOBILE` title. The title displays live readiness for WebGL, world/water, the full initial requested LOD generation, scenery, player/Box3D, and a successfully rendered frame. `START GAME` appears only when those requirements are ready and no reported initialization failures remain. The title is not automatically dismissed; starting removes the overlay and unlocks player input and the Admin/Inventory panels. Until then, movement, look, zoom, and swim input are disabled while the simulation and geometry streaming continue. Errors remain visible on the title screen and block Start. This is a readiness gate, not an artificial timer, and it does not change terrain selection, collision or rendering algorithms. Android startup behavior remains to be validated.

## Animated block avatar integration (2026-10-13)
- The standalone `assets/models/debug/quiver_block_avatar.glb` is now copied to the Vite public models directory in the Android build and loaded by `web/src/player-avatar.js` using Three.js GLTFLoader.
- The existing translucent procedural capsule remains in the avatar scene graph, and the separate Box3D player capsule retains all collision, movement, and contact authority. The new model is a visual child, not a replacement collider.
- The built-in `Idle` and looping `Walking` clips are driven by the existing PlayerSystem animation requests and a delta-time AnimationMixer. Unsupported animation requests fall back to Idle.
- The Quiver Mobile startup gate waits for `GLB player: READY` before offering Start Game. A load failure is reported and blocks entry rather than silently hiding it.
- Runtime display, animation playback, and Android build remain unverified.

## Android GLB path correction (2026-10-13)
The animated block avatar is packaged by the existing Android workflow at `web/dist/models/debug/quiver_block_avatar.glb`, becoming `/assets/web/models/debug/quiver_block_avatar.glb` in the WebViewAssetLoader origin. `PlayerAvatar` now resolves `models/debug/quiver_block_avatar.glb` against `document.baseURI`, rather than requesting `/models/debug/...` from the domain root. This also works from the desktop Vite root. The translucent capsule visual and Box3D capsule remain alongside the GLB; the title screen continues requiring successful avatar loading. Device verification is pending.
