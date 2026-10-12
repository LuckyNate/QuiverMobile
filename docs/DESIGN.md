# QuiverMobile — Unified Game and Engine Design

QuiverMobile is **one game project**. QuiverGL is the planetary rendering, simulation, and physics technology supporting it, not a separate game. The game combines free planetary exploration, survival and crafting, camp building, deep character progression, action combat, and Metroidvania-style boss progression.

This document separates **intended game design** from **currently implemented engine techniques**. A design requirement below is not a claim that its gameplay system is already implemented.

## Core game experience

- **Free exploration:** One continuous spherical planet, traversable between biomes without level-select transitions. Players can encounter later challenges before being equipped to beat them.
- **Combat:** A hybrid of *Vampire Survivors*-style action combat and *World of Warcraft*-style character development: substantial combat encounters combined with deep, graduated long-term character progression. Exact targeting, ability, and input details remain to be designed.
- **Metroidvania progression:** Capabilities and achievements unlock access to further challenges and boss fights. Discovery and travel are open even when progression gates remain.
- **Survival, gathering, and crafting:** Players gather materials, process them through facilities, craft equipment, build camps, and prepare for more demanding biomes and combat.
- **Persistent settlement:** Players maintain their own camps. Neighboring camps can naturally form villages without merging ownership.

## Twenty biomes on the D20 planet

The planet is based on an icosahedron with **20 root triangular faces, corresponding to 20 distinct biomes**. Each biome has terrain, vegetation, resources, and challenges characteristic of that environment. Scenery includes trees, bushes, grass, and other biome-appropriate environmental elements, alongside the planet's broader terrain and water systems.

The biomes also form a **graduated progression sequence**. The easiest biome is **Meadows**; the next is **Black Forest**. The remaining biome names, ordering, flora, enemies, and bosses are not yet specified.

### Two-resource dependency rule

Each biome provides the local materials and infrastructure needed for much of its own progression, **except for two essential resources** that must be acquired through exploration outside that biome.

The resource distribution advances as a chain:

1. **Meadows** lacks two progression-essential resources, requiring travel to **Black Forest**.
2. Each next biome introduces **two new materials** that were unavailable in the preceding biome.
3. At the same time, each next biome **drops two resources that were essential in the previous biome**: those resources are not locally available there.
4. This rolling exchange continues through the biome progression sequence, so choosing to live in any one biome never eliminates the need to visit others.

“Drops” here means **ceases to provide locally**, not that the resource becomes useless or is deleted from inventories. Exact resource names, distribution, recipes, and how the final biome's dependencies close are intentionally undecided.

This is a design constraint for resource placement and crafting dependencies: no biome should become self-sufficient enough to bypass inter-biome exploration.

## Combat and progression

Combat supports immediate action and increasingly sophisticated character growth. Long-term progression should feel graduated rather than merely increasing numerical difficulty. Exploration, equipment, resources, and player capabilities contribute to advancing through encounters and unlocking boss fights.

Boss progression uses Metroidvania-style prerequisites; **a one-boss-per-biome rule has not been established**. Boss identities and specific unlock conditions remain open design questions.

## Cabin building and construction

Cabin building is a lightweight, hands-on part of survival and settlement life. It should be **simple to start, fun to expand, and moderately layered**, without becoming a detailed carpentry simulator.

- **Standard material:** Twelve-foot logs form the basic modular building unit. Stack logs to construct walls, with convenient automatic alignment and corner connections.
- **Basic shelter:** Stack walls, fill the enclosed space with a floor, and add a roof. A small functional cabin should be quick to build.
- **Three opening positions per wall:** Each twelve-foot wall has **left, center, and right** positions for doors or windows. Build a solid wall first; then designate a cutout using an axe. The game performs the cutting and finishes the opening automatically, rather than asking players to cut each log.
- **Expandable construction:** Add rooms, walls, roofs, and other sections to an existing building without rebuilding from scratch.
- **Drop-and-play options:** Place ready-made structures or sections as a convenient alternative to building log by log. Prefabs and individually placed construction should be compatible, so a prefabricated cabin can be expanded.
- **Functional interiors:** Players can place furnishings, storage, crafting equipment, and other usable objects inside their cabins.
- **Design priority:** Construction is forgiving and physical enough to be satisfying. Avoid manual notch-cutting, individual log trimming, excessive menus, and complex construction requirements.

## Multiplayer, camps, and villages

The game uses **independent players and emergent cooperation**, not a formal party mechanic.

- Camps are individually owned. Players can establish nearby but separate camps, naturally forming villages without merging ownership.
- Entry to another player's camp and use of its facilities requires an **invitation**. Visitors cannot enter simply because a camp is nearby.
- Invitations are **temporary and owner-present**: the visitor can share facilities and resources permitted by the owner while they are there together, but the invitation does not transfer ownership or grant permanent access.
- An invited neighbor might use another player's furnace to process gathered metal. Compensation is a matter of player choice or negotiation, rather than a mandatory service fee.
- Players can explore, fight, trade, gather, and defend one another without joining a party.
- Larger groups can cooperate to maintain neighboring campfires, defend their settlement, and divide gathering work. Newer villagers may contribute fuel even if they cannot build advanced facilities.

### Bonfire protection and the no-outcamping rule

**Bonfires are the foundation of camp maintenance and protection.** The world is hostile: enemies are widespread, genuinely safe spaces are scarce, and roaming NPC enemies attack unprotected structures on sight.

- **Universal fueling:** **Any player may add fuel to any fire**, including another player's or an enemy's fire. Fueling does not require ownership, invitation, or alliance. Gathering and delivering fuel costs resources and effort.
- **Attackable fuel:** Attacking a bonfire **destroys its stored fuel** rather than merely making it burn faster. When fuel runs out, its camp loses bonfire protection.
- **Owner's map marker:** A burning bonfire anchors the camp to **its owner's own map**. If the fire goes out through neglect, that camp's marker disappears from the owner's map. This is a loss of navigation, not an instantaneous deletion of the building.
- **Finding a lost camp:** The original structures remain in the physical world if they have survived. To recover a neglected camp, its owner must physically find it again and relight the fire; the map does not simply guide them back to it.
- **Environmental consequences:** Unprotected buildings are attacked on sight by roaming NPC enemies and may be destroyed. Given the world's widespread hostility, a neglected camp is unlikely to remain intact indefinitely.
- **No arbitrary abandonment deletion:** Camps are reclaimed by danger and loss of maintenance, **not** by an artificial inactivity countdown. An abandoned camp persists only as long as its actual structures survive.
- **Village maintenance:** Neighbors can add fuel and defend nearby structures, allowing active communities to keep settlements alive. Even fueling a rival's bonfire is allowed if a player chooses to spend the effort.

The intended **no-outcamping rule** emerges from these interconnected mechanics: camps require ongoing labor, bonfire protection, and defense; neglect removes the owner's map marker and exposes the buildings to the hostile world. No universal timer, claim-expiration menu, or permanent safety guarantee is required.

## Planetary volume, bedrock, cavities and water (agreed design)

The planet is **not a hollow terrain shell**. It consists of a permanently FULL spherical bedrock core and a substantial surrounding solid crust. The crust can contain naturally authored or procedurally generated caves, tunnels, holes, overhangs and craters; **player digging or deformable terrain is not a committed gameplay feature**. Crust thickness and bedrock radius are configurable and remain undecided.

- **Core:** An analytic solid sphere; no radial wedges to the center and no individual interior voxels required.
- **Crust:** A genuinely occupied volume from the core to its outer terrain boundary, except where explicit cavities remove material. Full octree cells may stay coarse; fine cells localize boundary queries without becoming a blocky collision surface.
- **Physical boundary:** The complete, fixed-resolution procedural outer terrain mesh **plus the surfaces of all holes and internal cavities** define FULL versus EMPTY. Cave walls, ceilings and floors are physical boundaries too. The rendered LOD mesh is purely graphical.
- **Initialization:** The authoritative physical surface and topology must be established independently of visual LOD before player physics begins. Whether all triangles are materialized upfront or immutable procedural chunks are initialized and materialized on demand remains a performance/engineering decision. No gameplay may rely on temporary camera-dependent geometry for solidity.
- **Water:** Water occupies open space supported or enclosed by **actual terrain** (including cave floors), never the abstract bedrock datum. Ocean sea level may provide a reference level, but lakes, rivers, crater pools and underground water can occupy other elevations when supported by terrain geometry. Water remains separate from FULL solid occupancy; its simulation/model is not yet decided.
- **Terrain modification:** Caves and voids do not imply a digging mechanic; no runtime terrain-editing requirement is adopted.

## Planetary volumetric solidity and collision broad phase (agreed specification)

- The **full-resolution procedural D20 outer mesh together with any internal cavity surfaces and the bedrock-core volume** defines the authoritative physical planet. Material inside the crust is FULL except in defined voids; outside the planet and inside cavities is EMPTY. Render-distance LOD must not alter those boundaries.
- A power-of-two **planet AABB** rejects outer space with one bounds test. At the current radius, the root is 32768 m on each side (half-size 16384 m), with a minimum spatial cell of 1 m and 15 subdivision levels.
- The octree represents large FULL and EMPTY regions without subdividing them. Boundary nodes retain references to exact outer or cavity surface geometry; **1 m is broad-phase indexing resolution, not the collision surface or a voxelized approximation of the planet**.
- Every object's complete (including swept) world-space AABB determines the 1 m cells it crosses. Only objects sharing at least one relevant cell may become pairwise physics candidates. Overlap between shapes larger than one cell must not be lost.
- The world and its stationary objects remain spatially solid even while far away or inactive. Broad-phase filtering governs whether *collision contact checks* are needed, not whether a physical object's volume exists.
- Box3D resolves contacts against precise collision shapes and outer/cavity terrain triangles, not 1 m cubes. No duplicate shell-versus-filled-cube contact geometry may be used.
- The candidate path is **universe/planet AABB → octree/cell broad phase → exact shape or full-resolution outer/cavity triangle boundary → Box3D contact**. Radial planetary gravity continues to apply independently.

**Implementation caveat (2026-10-11):** the runtime currently generates local procedural cube-sphere hull patches from the same heightfield, and the visible D20 terrain changes geometry with LOD. The radial heightfield cannot by itself define cave interiors or overhangs. Local surface sampling is **not** yet the requested single immutable full-resolution D20 triangle mesh. Until immutable outer and cavity boundary geometry is authoritative for both rendering derivation and Box3D, triangle-perfect coincidence and cavity support are open integration requirements. Do not describe current hulls as exact full-resolution D20 triangles.

## Implementation boundary

The game design above is the intended destination. The current runtime remains an experimental planetary engine prototype. The technical implementation notes below describe its existing and historical approaches and require verification before being treated as rebuild requirements.

---

## QuiverGL — Existing Engine Design and Techniques

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
**Existing prototype behavior, not the final terrain-water design:** The water mesh is a transparent animated sea-level icosphere; no underwater fog. Water occupies open space above submerged ground. A capsule submerged fraction controls buoyancy and radial drag; forward input and camera pitch permit diving. Ocean rendering and shore-edge masking are areas for further validation, particularly with terrain fade transitions.

## Camera and globe navigation
A player-local tangent frame is parallel transported across the spherical world to preserve heading independently of any fixed geographic pole. Camera distance follows a log-scaled vertical slider; orientation lerps from third-person chase toward outward-radial globe overhead. Movement remains player-relative at any scale. Near clipping starts at 1 m and increases at large camera altitude to improve depth precision, while planet-scale zoom caps fine terrain subdivision.

## Intentional boundaries
Current experience is a diagnostic engine prototype, not a finished planet renderer. Some design notes in `prototype-architecture.md` describe earlier historical milestones, not present implementation. Do not reinstate old constants or pretend older static-planet notes are active requirements.
