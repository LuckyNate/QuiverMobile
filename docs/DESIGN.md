# QuiverGL / QuiverMobile — Engine Design

Status: adopted baseline, 2026-10-08.

## Purpose
A common browser-native 3D engine that runs unmodified in a desktop browser and in an Android WebView. No emulator or separate native graphics backend.

## Architectural invariants
- **Three.js** is the scene renderer; require **WebGL2**.
- **Blender -> GLB** is the primary authored-mesh workflow. Load GLB once, upload geometry once, instantiate freely. Geometry, normals and material values come from the asset.
- The world is a recursively subdivided **icosphere**. The root icosahedron has power-of-two edge length in meters; initial diagnostic setting: **128 m**. The world is geometrically small for now, not yet planet-size.
- Terrain LOD and visibility are spatial partition concerns, not separate rendering backends. Solid triangles are the normal draw mode. Wireframe and AABB overlays are optional diagnostics.
- **Box3D compiled to WebAssembly** is the 3D physics solver.
- The **octree of axis-aligned bounding boxes** is the authoritative coarse representation of *fixed/static world solidity*. It is also used to query physics collision candidates; it is not replaced by Three.js mesh raycasts.
- Do not create one simulated rigid body per static world triangle or per octree node. Query the octree for overlapping static occupancy, hand bounded relevant static box shapes to Box3D, and let Box3D resolve contacts against dynamic bodies. Retire distant proxies when safe.
- Dynamic bodies belong to Box3D. Do not use rendered meshes as the collision authority.
- Keep rendering, world generation, physics and the app shell modular, so individual features can be changed without redesigning other systems.
- Preserve player-world/camera intent independently of visuals.

## Fixed-world collision contract
1. Author or procedurally derive solid world occupancy.
2. Partition it into conservative octree AABBs in **world coordinates**. Solid leaves are the coarse static collision source. Adjacent boxes automatically merge into maximal rectangular volumes when their two orthogonal spans match and their third-axis faces touch. Merging repeatedly is required until no valid joins remain. A face touch alone cannot justify filling empty space. Octree siblings can collapse and boxes across sibling boundaries can merge, without exceeding represented solids.
3. Given dynamic body bounds and motion sweep, query nearby occupied AABBs.
4. Create/update bounded **static Box3D box shapes** for candidate AABBs in the current simulation neighborhood (not the entire planet).
5. Step Box3D at fixed timestep; let Box3D compute contact response.
6. Copy dynamic physics transforms into Three.js render instances.
7. When the simulation origin shifts, relocate/rebuild nearby proxies consistently. Rendering and physics share a coordinate-frame conversion.
Static geometry is never treated as a free dynamic body. AABB approximation can be refined by subdivisions; octree culling and simulation proxy lifecycle are separate decisions.

## Runtime modules
- `web/src/main.js`: startup, scene, input, main loop.
- `web/src/world.js`: recursive icosphere terrain selection/geometry (eventually horizon and frustum culling).
- `web/src/solidity.js`: static AABB octree, bounded candidate queries, immutable occupancy data.
- `web/src/physics.js`: Box3D WASM, fixed-step world, static proxies generated from octree queries.
- `web/public/models/debug/player_capsule.glb`: initial player placeholder, authored as GLB.
- Android: a WebView wrapper for **the same built web assets**, including in-app updater.
- PC: served as ordinary web files; no native APK or emulation.

## Startup milestone
First playable/inspectable slice: solid icosphere with adjustable wireframe overlay, chase camera and touch/keyboard input, gray GLB player, and Box3D static-object collision proof backed by an octree. This does **not** claim full planet-wide physics, terrain collision, geodesic occupancy, or seamless octree proxy streaming.

## Working agreement
Every modification is explicitly negotiated, scoped, and approved. Implement requested behavior only; preserve working code, versioning and distribution. Verify build before treating any release as good. Do not silently convert diagnostics into the renderer architecture.
