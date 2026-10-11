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

## Camps, cooperation, and villages

- Camps are individually owned and persistent. Players can establish adjacent camps and cooperate as a village without requiring a formal party system.
- Camp entry and use of another player's facilities are **invitation-based**; being nearby does not automatically provide access.
- An invitation permits temporary access while the inviting owner is present. More permanent cooperation can occur through neighboring camps, without making one camp jointly owned.
- Players may use permitted equipment such as another player's furnace to process their own materials. Owners may negotiate compensation or allow use freely.
- Players can help defend neighboring camps and contribute wood to communal bonfires.
- Attacking a bonfire destroys its stored fuel; protection is lost when that fuel is exhausted.
- Settlement and raiding mechanics must respect the **no-outcamping rules**, whose exact enforcement details remain to be specified.

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
The water mesh is a transparent animated sea-level icosphere; no underwater fog. Water occupies open space above submerged ground. A capsule submerged fraction controls buoyancy and radial drag; forward input and camera pitch permit diving. Ocean rendering and shore-edge masking are areas for further validation, particularly with terrain fade transitions.

## Camera and globe navigation
A player-local tangent frame is parallel transported across the spherical world to preserve heading independently of any fixed geographic pole. Camera distance follows a log-scaled vertical slider; orientation lerps from third-person chase toward outward-radial globe overhead. Movement remains player-relative at any scale. Near clipping starts at 1 m and increases at large camera altitude to improve depth precision, while planet-scale zoom caps fine terrain subdivision.

## Intentional boundaries
Current experience is a diagnostic engine prototype, not a finished planet renderer. Some design notes in `prototype-architecture.md` describe earlier historical milestones, not present implementation. Do not reinstate old constants or pretend older static-planet notes are active requirements.
