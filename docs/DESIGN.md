# QuiverMobile — Design

How the game is built: architecture, world systems, file map, build and verification. What the game *is* lives in [GAME_BIBLE.md](GAME_BIBLE.md).

**Status:** experimental working prototype. Values below are current runtime configuration, not permanent engine contracts — several have changed size before (root edge 8192 → 4096 → 256 m) and will again. Verify against `web/src/engine/world/world-config.js` and the source before treating any number as fixed. Where a feature is described as implemented, it has been built and compiled but **in-game device behaviour is not verified** unless stated.

---

## 1. Platforms and stack

| Layer | Technology |
| --- | --- |
| Renderer | Three.js 0.180 / WebGL2 |
| Physics | `box3d-wasm` (Box3D) in WebAssembly |
| Particles | `three-nebula` |
| Build | Vite 7, ES modules, Node 22+ |
| Device shell | Android Kotlin `WebView`, Gradle |
| CI/release | GitHub Actions — Vite build, copy `web/dist` into app assets, sign APK, publish update |

The same Vite bundle runs on desktop browsers and in the Android WebView. Android hosts bundled assets through `WebViewAssetLoader` at `https://appassets.androidplatform.net/assets/web/`, never `file://`, so relative asset paths resolve against `document.baseURI`. Native VR/OpenXR is a future direction, **not implemented**; the Kotlin/CMake `renderer.cpp` is a native shell, not the game renderer.

## 2. Separation of authority

Five authorities, and they must not be confused with each other:

- **`TerrainHeight.height(direction)`** — the mathematical terrain. One seeded radial function. It is the authority for visible geometry, for implicit solidity, and for local collision hulls. Rendered triangles are *samples* of it and are never the source of truth.
- **`WorldSystem`** — spatial index (octree), implicit solid occupancy, and the 1 m local collision-hull source.
- **`PhysicsWorld`** — Box3D dynamic bodies, radial gravity, and a bounded set of static contact hulls near the player.
- **`PlayerSystem`** — input, player-local heading, chase camera, movement.
- **`Game`** — construction and the frame loop. It owns the systems; it does not implement them.

Render-only geometry changes (LOD, seam conformance) must never alter physics or water.

## 3. Code map

`web/src` — one entry module, `main.js`, that starts `Game`; everything else lives in a folder that names its job. Two rules keep the tree honest: a folder holds only things that change for the same reason, and `engine/world` (the planet's geometry and solidity) never mixes with `engine/biome` (what is allowed to exist on it).

```
main.js                 bootstrap: finds #app, runs new Game({app}).start()

game/
  game.js               Game: constructs systems, wires panels/console, starts loop
  game-runtime.js       frame loop, physics bring-up, readiness, hard reset
  survival.js           needs/health model
  input/tap-controller.js   tap input: harvest, move-to, bonfire placement

console/
  commands.js           every owner console command, one class, explicit handlers
  camp-commands.js      registers /die against engine/camp/camp-respawn.js

gui/
  status-report.js      named init stages, failures, onFailed hook
  loading-screen.js     title overlay, readiness lines, START GAME gate
  profiler.js           per-frame timing readout in the Admin panel

ui/
  game-panels.js        thin coordinator, mixes the panel modules onto one class
  panel-layout.js       panel shells, half-screen expansion, canvas resize
  panel-inventory.js    tool/resource tabs, slot counts, selection
  panel-gear.js         active tool, log strength, readiness colouring
  console.js            the console widget: history, help, command registry
  survival-meters.js    survival HUD readout
  tool-icon.js          tool icon rendering for the panels

player/
  player.js             PlayerSystem: input, heading, chase camera, movement
  player-controls.js    input bindings and the movement intent

engine/world/           the planet: shape, solidity, water
  world-config.js       planet dimensions, derived scale, per-face biome config
  terrain-height.js     seeded layered radial height authority
  d20-address.js        stable face/cell/chunk addressing
  world.js              WorldTerrain: D20 LOD, seams, atomic generation swap
  world-system.js       owns the octree, implicit solidity and surface chunks
  world-octree.js       unified spatial index (standalone, not wired in yet)
  implicit-sphere.js    analytical static occupancy
  world-solidity.js     static solidity from convex icosphere triangles
  solidity.js           disjoint maximal solid AABBs, merge pass, octree
  sphere-surface.js     outward 1 m collision hull patches
  chunked-surface.js    deterministic on-demand surface chunks
  terrain-occupancy.js  deterministic 32 m surface query chunks
  rolling-terrain-cache.js  bounded rolling terrain geometry cache
  water.js              visual sea surface; immersion is sampled from terrain

engine/biome/           what may exist where
  biome.js              biome classification by id/parameters
  biome-map.js          D20 face classification shared across systems
  biome-population.js   density → candidate placements
  biome-resource-zone.js   32 m resource cell grid per face, streamed 5×5
  resource-density.js   expected resources per km²
  resource-distributor.js   seeded per-cell candidates without reading triangles
  spawn-point.js        deterministic dry Meadows spawn search

engine/physics/
  physics-world.js      Box3D world, gravity, static proxy sync, player capsule
  physics-body.js       body/collider helpers
  camera-collision.js   camera pull-in against terrain
  physics.js            re-export barrel for the two modules above

engine/render/
  game-view.js          renderer, scene, camera, resize
  scenery-visibility.js player-centered visibility budget for scenery
  debug-aabb.js         hidden AABB debug view

engine/entity/
  world-object.js       stable id, type, position, state, snapshot
  world-object-manager.js  spawn/lookup/mutate/despawn over the registry
  object-registry.js    live objects by stable id
  environmental-object.js  non-interactive scenery object
  structure.js          player-built world object contract
  shared-world.js       persistent entity store, inventory, harvest records

engine/resource/
  resource.js           resource object contract (tool, yield, contact policy)
  resource-handler.js   live streaming entry point (trees, grass, sticks, stones)
  resource-type-registry.js  type → spawn/unload adapter
  ground-resources.js   ground pickups and selection
  rock.js               pick-gated rock contract (not spawned)
  mineral-deposit.js    pick-gated deposit contract (not spawned)

engine/flora/
  trees.js              tree adapter: population, visual, contact, lifecycle
  tree.js               tree as a Resource
  conifer.js            pine species: logs plus pine sap
  tree-population.js    per-cell candidate handling and replacement
  tree-visual.js        tree mesh construction
  tree-sprite.js        one-shot tree → texture for distant billboard cards
  tree-contact.js       axe-gated contact against the Box3D player body
  tree-lifecycle.js     felling, fading, flight, collection, save state
  grass-visual.js       grass blade rendering
  tall-grass.js         tall grass placement

engine/creature/
  boar-visual.js        boar visual only (no behaviour yet)

engine/tool/
  tool-registry.js      tool definitions
  interaction-system.js tool/resource permission checks
  models/               axe, bow, club, hammer, knife, scythe, torch,
                        parts.js shared geometry, index.js registry

engine/avatar/
  player-avatar.js      avatar assembly, GLB fallback
  jim-body.js           articulated body, planted supports, predictive IK
  avatar-shape.js       avatar shape refinement
  two-bone-ik.js        avatar limb solving
  dye-palette.js        dye colours

engine/camp/
  bonfire.js            bonfire mesh, 12-log build, fuel reserve, Add Fuel button
  camp-rest.js          resting near the fire sets the respawn point, sit pose
  camp-respawn.js       pending camp teleport handoff, applied on the physics step

engine/fx/
  billboard-particles.js   three-nebula billboard particles
  voxel-fire-emitter.js    voxel fire emission
```

`web/test` mirrors the source it covers: `web/test/world` holds `terrain-occupancy`, `world-config` and `world-octree`; `web/test/avatar` holds `two-bone-ik`.

## 4. World scale

Everything derives from `WORLD_SETUP` in `web/src/engine/world/world-config.js`:

```
rootEdgeMeters            256        D20 root face edge
finestTerrainMeters       1          nominal finest edge
terrainLodBandMeters      20         horizontal LOD band width
terrainLodRefreshMeters   4          re-selection threshold
collisionResolutionMeters 1          octree cell / hull resolution
collisionChunkMeters      32         surface query chunk
resourceCellMeters        32         resource cell grid
cameraMaxZoomDiameters    2
cameraFarClipDiameters    6
seaLevelOffsetMeters      -1
```

Derived in `WORLD_SCALE`: `radius = rootEdge·√(10+2√5)/4`, `diameter`, `maxTerrainLod = round(log2(rootEdge/finest))` = 8, `octreeHalfSize` (next power of two above radius·(1+height ratio)+64), `octreeMaxDepth` = log2(2·halfSize), camera zoom/far, and `resourceStreamMeters = rootEdge·0.25`.

**Changing the planet size is not one edit.** It requires auditing: radius-derived noise wavelengths and amplitudes, maximum relief bound, LOD depth, octree bounds and depth, resource stream radius, camera extents, and the shoreline spawn search.

## 5. Terrain

**Height.** Seeded 3D value noise sampled on the unit sphere, so wavelengths scale with planet radius. Broad continent/ocean relief is sampled **first** and gates the finer layers, so detail never feeds back into its own classification. Layers activate by elevation band: plains texture near sea level, foothills, highland detail, then mountain ridges and crevices. Smoothstep blends keep bands from hard-edging. Seed is a plain string (`QuiverGL`), hashed with FNV-1a, deterministic for every string including `""`.

**Sea level** is a fixed datum at `RADIUS − 1 m`. It is not recomputed from a water percentage.

**LOD.** Persistent D20 four-child hierarchy. Detail is selected player-centrally from horizontal distance in fixed 20 m bands (`terrainLodAtHorizontalDistance`), recomputed on a stable anchor rather than every frame. Geometry is cached per node address + detail, streamed at most one new mesh per frame, with bounded eviction. Older notes about 20% split hysteresis, zoom-specific caps, 12 m skirts, shader morphs and ghost fades are **historical, not current**.

**Seams (implemented in source, device-validated: no).** The finer node touching a shared boundary is authoritative: its recursively normalized midpoint subdivision and its sampled heights define the boundary. The coarser neighbour inserts matching vertices using the same midpoint construction — **not** linear interpolation between endpoints — and locally retriangulates only the affected border, keeping its interior coarse. Mixed-LOD adjacency across D20 root faces counts too. Neighbour edge configuration must be part of geometry-cache identity or trigger targeted invalidation; stale seams are unacceptable.

**Coverage during LOD replacement.** A complete coarse 20-face globe is created first and retained. New LOD sets are built as hidden cached meshes while the last complete generation stays displayed; visibility swaps atomically once every requested mesh exists. Displayed and requested meshes are both protected from eviction. This fixes transient missing coverage, which is a different bug from cracks.

## 6. Solidity and physics

- Terrain radial height is `RADIUS + height(direction)`. Visible meshes never define what is solid.
- **`ImplicitSphere` / octree** answer "is this cell inside the planet" analytically against the shared solid boundary, without building cube objects. 1 m is broad-phase index resolution, not a voxelised surface.
- **`SphereSurface`** generates outward-facing 1 m hull patches from the same height provider near the player; only nearby patches are registered with Box3D as static proxies. Never every triangle of the planet.
- **`TerrainOccupancy`** caches physical surface queries in deterministic 32 m world-space chunks, independent of graphics LOD; chunks can be discarded and regenerated from the seed.
- **`PhysicsWorld`** runs a fixed timestep, radial gravity toward the planet centre, a dynamic player capsule and demo falling boxes. Player movement target is 10 m/s. `syncStatic` adds support before retiring stale contact bodies so contact never vanishes for a frame.
- **Unified octree module** (`engine/world/world-octree.js`): one spatial index for static world, terrain triangles, player and dynamic bodies, with stable ids, triangle-AABB broad phase (the AABB is never treated as solid), swept-AABB candidates, and `physicsCandidates(dynamicId, proposedBounds)` for the Box3D adapter. It is tested standalone (`node --test web/test/world/world-octree.test.js`) and **not yet wired into the runtime**.
- **Camera** pull-in is done with physics-free queries (`camera-collision.js`).

## 7. Water

Transparent animated sea-level icosphere at `RADIUS − 1 m`, no underwater fog. It is purely visual and non-solid. Immersion is sampled from the terrain height beneath the player: a submerged capsule fraction drives buoyancy and radial drag, and forward input while looking down adds dive effort. Biomes will eventually place water at other elevations supported by terrain; the volumetric water model is **not designed yet**.

## 8. Population and persistence

**Streaming.** `engine/biome/biome-resource-zone.js` owns a fixed 32 m tangent cell grid per D20 face. The handler requests a bounded 5×5 cell neighbourhood around the avatar, unloads cells behind the player, and populates at most one new cell per biome per frame. It samples elevation read-only: terrain, seed, LOD and physics are untouched. Only Meadows currently generates content; `STARTER_BIOME_FACE = 6`.

**Identity.** Resource ids encode face, type, cell coordinate and candidate ordinal — stable across LOD changes and reloads. `SharedWorld` harvest records are consulted, so a harvested resource is not recreated when its cell reloads.

**Persistence.** `SharedWorld` is the entity store: inventory, equipped tool, dyes, harvest records, and named entities such as `camp:bonfire:<playerId>` (position, fuel `endAt`) and `camp:respawn:<playerId>` (safe standing spot). This model is preparation for owner-hosted multiplayer, not a networking transport.

**Trees.** `trees.js` coordinates tree objects between population, visual, contact and lifecycle modules. Contact is a velocity-response adapter acting on the existing Box3D player body — **not** registered Box3D tree fixtures. Standing trunks push back; felled trunks topple, shed foliage, fly to the chopper and shrink into the inventory.

## 9. Startup, readiness and the title gate

`gui/status-report.js` keeps a map of named stages with `WAITING` / `LOADING` / `READY` / `FAILED` plus a detail string: `document`, `terrain setup`, `terrain geometry`, `octree solidity`, `biome resources`, `GLB player`, `Box3D`, `first frame`, `frame loop`. It also catches `window` `error` and `unhandledrejection` as `script` / `promise` failures, and mirrors the current failure text to `localStorage` (`quiver-last-stages`). `Game` wires `status.onFailed` to print new failures into the owner console.

`gui/loading-screen.js` renders the `QUIVER MOBILE` overlay: readiness lines, a scrolling tip strip, and `START GAME`. `Game.updateTitleReadiness()` evaluates readiness from live state each frame — renderer, world/water, full initial LOD generation, scenery, avatar, player physics, first rendered frame, and zero failures — and only then reveals Start. Starting removes the overlay, unlocks input and makes the Admin/Inventory panels visible. Failures stay on screen and block entry. This is a readiness gate, never a timer.

## 10. Console and panels

`console/commands.js` registers every command through `panels.registerCommand(name, handler, description)` — explicit handlers, no `eval`, owner only. `ui/console.js` is the widget: history, `help`, `clear`, dispatch. `console/camp-commands.js` registers `/die` and queues a camp teleport through `engine/camp/camp-respawn.js`, which only stores a pending position; the physics step applies it to the capsule. Nothing here runs on a timer.

Degraded paths are deliberate: `hardReset(label)` blanks the window and reloads (used by `/reset` and after `/wipe confirm`), and `syncAvatarToCapsule()` snaps the chase camera rather than sweeping it across the planet.

## 11. Build and run

```
cd web
npm install
npm run dev      # vite --host 0.0.0.0
npm run build    # vite build → web/dist
```

There is no `test` npm script; run the tests directly:

```
cd web
node --test test/world/world-config.test.js
node --test test/world/terrain-occupancy.test.js
node --test test/avatar/two-bone-ik.test.js
node --test test/world/world-octree.test.js
```

Android: the workflow builds the web bundle, copies `web/dist` into the app's web assets, signs a release APK with the encrypted keystore in `signing/`, and publishes the update. A green build does **not** verify rendering, feel or frame rate on device.

## 12. Regression checklist

1. Startup reaches Box3D `READY` and a first rendered frame; the title only offers Start when everything is ready.
2. Spawn is dry Meadows ground with real water nearby.
3. The player is supported by solid ground while moving at 10 m/s; contact-hull streaming does not stall frames.
4. Water stays occluded by dry ground through LOD changes; no underwater fog appears.
5. Nearby LOD subdivides without cracks, T junctions, stale boundary variants, missing coverage or thrashing rebuilds.
6. Zoomed out: whole-globe coverage, acceptable depth precision, no z-fighting, player-relative map heading.
7. Harvest, bonfire build (hammer + 12 logs), rest-to-set-respawn, fuel, `/die`, `/stuck`, `/wipe confirm`.
8. Signed Android build succeeds, *and* the game is actually played on device.

## 13. Known limitations

- Render geometry and Box3D contact surface are separate: a 1 m heightfield can never represent caves or overhangs, and the current hull patches are not the immutable full-resolution D20 triangle mesh the solid-volume design requires.
- Mixed-LOD seam conformance is implemented but **unverified** on device (cross-face and changing-neighbour cases especially).
- Atomic LOD generation swap can delay new detail when many meshes are queued; memory and frame pacing are unmeasured on Android.
- `world-octree.js` is standalone; runtime integration and global dynamic gravity are unverified.
- Tree contact is velocity response, not physical tree bodies.
- No native VR backend, no coordinate rebasing, no horizon-based frustum culling, no automated planet-scale benchmark.
- Rocks, mineral deposits and structures have contracts but no live rendering or harvesting.
- No enemy/mob population, AI, weather runtime, or per-biome terrain shaping.
- No multiplayer transport.

## 14. Open engineering work

- **Per-biome parameter sets:** extend `world/world-config.js` from names/colours/densities/grass into terrain shaping, climate and variable weather, water and hazards, vegetation and mob rosters, atmosphere. Keep world-global settings separate from per-biome properties and from simulated dynamic state, and keep one authoritative terrain/solidity definition.
- **Day/night:** derive world age from creation timestamp plus real elapsed time (including while the game is closed); compute shared sun/moon directions from it; drive sky shader, directional sunlight, ambient light and shadows from the same calculation; illumination must depend on surface normal and local horizon so the terminator is correct across the globe, not a uniform dimmer. One authoritative world clock.
- **Render resolution control:** an Admin control for WebGL pixel ratio, independent of terrain LOD, persistent between launches, without touching touch coordinates, FOV or gameplay.
- **Seam validation on device:** cross-face boundaries, adjacent-detail changes, cracks, sustained frame rate.
- **LOD swap validation on device:** no exposed holes while walking, startup fallback, convergence time, cache/memory growth, frame pacing.
- **Mob population and behaviour:** reuse the resource population contract for face ownership, seeded candidates, density/tolerance, streaming, stable ids, persistence and hidden replenishment — no duplicate mob-only spawner. Separate behaviour controllers for senses (earshot sphere, eyeshot cone), Patrol/Alerted/Attacking, territories, movement, targeting, combat.
- **Resource bounce-back feel:** replace the single-bounce response with a short physical backward step, responsive steering, no control lock, no repeat knockback inside foliage, keeping the capsule flash.
- **Volumetric planet:** immutable outer and cavity boundary geometry authoritative for both rendering derivation and Box3D, before caves or overhangs are claimed.
- **Multiplayer transport** on top of the `SharedWorld` event/snapshot model.

## 15. Working agreement

Repository process rules live in [`reporules.md`](../reporules.md): agree scope before writing, smallest necessary change, no opportunistic refactors, no unrequested file removal, no unverified claims, explicit approval per commit.

## 16. History that must not be reinstated

Superseded values and techniques, recorded only so they are not mistaken for current design: 8192 m and 4096 m root edges, 12–13 subdivision levels, fixed-radius grey-sphere terrain, 12 m downward render skirts, 20% split hysteresis, 0.35 s ghost fades, shader height morphing, screen-door dithering, and 4096 m octree half-widths. The old `docs/prototype-architecture.md` and `web/docs/OCTREE_ENGINE.md` notes are folded into this document and §6.
