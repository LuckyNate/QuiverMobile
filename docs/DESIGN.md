# QuiverMobile — Unified Game and Engine Design

QuiverMobile is **one game project**. QuiverGL is the planetary rendering, simulation, and physics technology supporting it, not a separate game. The game combines free planetary exploration, survival and crafting, camp building, deep character progression, action combat, and Metroidvania-style boss progression.

This document separates **intended game design** from **currently implemented engine techniques**. A design requirement below is not a claim that its gameplay system is already implemented.

## Gameplay interface — fixed inventory and owner console

Two matching collapsible panels reserve a narrow strip at the top and bottom of the screen. The top **Admin** panel expands downward to half-screen with a registered-command console. Only the world owner may execute commands; new commands register through explicit handlers, never arbitrary evaluation. The bottom **Inventory** panel expands upward to half-screen with predetermined item slots (axe, hammer, 4-meter logs and reserved future items). Only one panel may expand at once. The gameplay canvas resizes to the unobstructed middle region; movement controls and zoom follow the remaining viewport. The inventory is the shared interface for equipment and contextual tools, not separate build/craft menus. This first iteration supplies UI infrastructure and an owner-console help/clear command; it does not implement the future building actions or networking permissions.

## Core game experience

- **Free exploration:** One continuous spherical planet, traversable between biomes without level-select transitions. Players can encounter later challenges before being equipped to beat them.
- **Combat:** A hybrid of *Vampire Survivors*-style action combat and *World of Warcraft*-style character development: substantial combat encounters combined with deep, graduated long-term character progression. Exact targeting, ability, and input details remain to be designed.
- **Metroidvania progression:** Capabilities and achievements unlock access to further challenges and boss fights. Discovery and travel are open even when progression gates remain.
- **Survival, gathering, and crafting:** Players gather materials, process them through facilities, craft equipment, build camps, and prepare for more demanding biomes and combat.
- **Persistent settlement:** Players maintain their own camps. Neighboring camps can naturally form villages without merging ownership.

## Twenty biomes on the D20 planet

The planet is based on an icosahedron with **20 root triangular faces, corresponding to 20 distinct biomes**. Each biome has terrain, vegetation, resources, and challenges characteristic of that environment. Scenery includes trees, bushes, grass, and other biome-appropriate environmental elements, alongside the planet's broader terrain and water systems.

The biomes also form a **graduated progression sequence**. The easiest biome is **Meadows**; the next is **Black Forest**. The remaining biome names, ordering, flora, enemies, and bosses are not yet specified.

### Parameterized biome environments (design target)

Every D20 root face is defined by a **biome parameter set**, interpreted by shared world systems rather than custom terrain or spawning engines per biome. The categories are:

- **Terrain and surface:** ground color/material, elevation, terrain shape and noise, slope, roughness, and geological features. Terrain parameters must ultimately feed the single authoritative terrain/solidity definition so rendering and collision agree.
- **Climate and weather:** local temperature, humidity, wind, cloud and fog characteristics, precipitation, and probabilities/ranges for changing weather. These define a biome's *climate*, not a frozen weather state.
- **Water and environmental conditions:** biome-specific rivers, lakes, pools, and environmental hazards where the authoritative terrain and water models support them.
- **Vegetation and resources:** allowed species/materials, appearance, density or population targets, tolerance, resource quality, and replenishment policy.
- **Mobs (wildlife and enemies):** allowed mob types and per-type population/density, tolerance, territories, senses, attributes, and selected behavior definitions. Mob behavior is configurable independently of the shared spawning framework.
- **Atmosphere and gameplay:** suitable local fog/sky/audio characteristics, environmental effects, and biome-specific gameplay/progression constraints.

**World-wide settings** (planet size, gravity, world age, celestial system) are distinct from **biome settings** (local terrain, climate, ecology, mob roster). **Dynamic state** (actual weather, moving mobs, current populations) is simulated from these settings and persistent world state; it is not hardcoded as an unchanging biome property. Where appropriate, environmental parameters transition across boundaries rather than changing abruptly at an invisible face edge. The precise numeric ranges and blending rules are not yet established.

**Current implementation versus target:** `web/src/engine/world-config.js` currently provides per-face names, ground colors, resource densities, and grass style; only Meadows (F06) is populated. Parameterized biome terrain shaping, weather, broader ecology, and mob spawning/AI are planned, **not implemented**.

### Shared population, specialized mob behavior (design target)

Resources, vegetation, wildlife, and enemies should use **one common biome-aware population/spawning contract**: deterministic face ownership and location candidates, per-type target/density and tolerance, streamed activation near players, stable identities, persistent harvest/death/state, unloading at distance, and replenishment at new valid sites hidden from all players. Reuse the rules and infrastructure; do not duplicate a separate location/spawn algorithm for enemy mobs.

**Population and behavior are separate responsibilities.** A mob's biome parameters decide *what* can spawn, *how many*, and *where*. A mob-type definition and behavior controller decide what an active individual *does*: movement, sensory responses, Patrol / Alerted / Attacking state transitions, targeting, combat, and interactions with other mobs. Mob-specific logic must not be embedded in tree/resource population code. Player and mob perception share the earshot sphere and eyeshot cone described below; territories and hostile encounters obey the existing combat rules.

The current `ResourceHandler` and resource-cell streaming supply part of the population foundation. No functional NPC/mob population or behavior runtime exists yet. Exact mob archetypes, numeric behavior parameters, spawn cadence, and future API/schema remain open for later design and approval.

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

### Shared perception and automatic combat targeting

Players and NPCs perceive the world through the same basic sensory model. NPCs do not have omniscient knowledge of targets beyond what they can hear or see.

- **Earshot:** A spherical hearing range. Hearing activity can alert an NPC and make it turn toward the source.
- **Eyeshot:** A directional vision cone. A target must be within the observer's field of view to be seen.
- **NPC behavior:** Three simple states — **Patrol**, **Alerted**, and **Attacking**. Responses to perception are specific to the enemy type; no elaborate investigation or tactical planning is required.
- **Territories:** Enemies spawn outside one another's territories, but can wander into each other's sensory ranges and fight. Hostile enemies can attack stronger foes without evaluating their chances of winning.
- **Player targeting:** Vampire Survivors-style automatic attacks use the shared perception system and each attack's actual reach and targeting constraints. An attack fires only when a valid target can actually be hit; it does not constantly activate against empty space.
- **Starter difficulty:** Meadows is the introductory biome. Even its strongest enemies are very easy.

Combat supports immediate action and increasingly sophisticated character growth. Long-term progression should feel graduated rather than merely increasing numerical difficulty. Exploration, equipment, resources, and player capabilities contribute to advancing through encounters and unlocking boss fights.

Boss progression uses Metroidvania-style prerequisites; **a one-boss-per-biome rule has not been established**. Boss identities and specific unlock conditions remain open design questions.

## Cabin building and construction

Cabin building is a lightweight, hands-on part of survival and settlement life. It should be **simple to start, fun to expand, and moderately layered**, without becoming a detailed carpentry simulator.

- **Standard material:** Four-meter logs form the basic modular building unit. Stack logs to construct walls, with convenient automatic alignment and corner connections.
- **Basic shelter:** Stack walls, fill the enclosed space with a floor, and add a roof. A small functional cabin should be quick to build.
- **Three opening positions per wall:** Each four-meter wall has **left, center, and right** positions for doors or windows. Build a solid wall first; then designate a cutout using an axe. The game performs the cutting and finishes the opening automatically, rather than asking players to cut each log.
- **Expandable construction:** Add rooms, walls, roofs, and other sections to an existing building without rebuilding from scratch.
- **Drop-and-play options:** Place ready-made structures or sections as a convenient alternative to building log by log. Prefabs and individually placed construction should be compatible, so a prefabricated cabin can be expanded.
- **Functional interiors:** Players can place furnishings, storage, crafting equipment, and other usable objects inside their cabins.
- **Design priority:** Construction is forgiving and physical enough to be satisfying. Avoid manual notch-cutting, individual log trimming, excessive menus, and complex construction requirements.


### Camp footprint, comfort, and placement

- **First structure:** The bonfire establishes the camp and gives **1 comfort**. Advanced building is available within the bonfire's influence footprint, not everywhere in the world.
- **Placement:** Select a construction piece (wall, floor, roof, etc.) and place it in the world. Pieces snap to logs and align at 90-degree increments.
- **Basic shelter comfort:** One completed **4×4 m hut** contributes **1 additional comfort**, bringing the starter camp with its bonfire to **2 comfort**.
- **Unique camp features:** Each unique completed part or feature of a camp can contribute to its comfort. Repeating the same feature does not repeatedly award comfort. Additional feature values remain to be defined.
- **Expansion:** Increasing the camp's comfort increases its bonfire influence area, allowing more construction.
- **Always persistent:** Construction, unbuilding, inventories and changes to comfort or camp extent are automatically persistent. There is no manual save mechanic.

### Unbuilding and crafting salvage

- **Player removal:** Players cannot damage or destroy structures through attacks. Structures are deliberately **unbuilt** when upgrading or moving.
- **No common-material refunds:** Unbuilding consumes/discards ordinary, readily gathered building resources; logs, sticks, stones and similar base materials are not recovered.
- **Crafting salvage:** Salvage is for crafting, where rare or unique items and components may be recoverable. Do not treat ordinary construction dismantling as a materials-recycling system. The exact salvage recipes and eligibility remain undecided.


## Peer-simulated multiplayer foundation

The player creating a world **owns the save and must remain connected for the session to exist**. Each joining device simulates its own experience. The owner stores the authoritative persistent changes, while peers exchange shared world events; simultaneous harvest claims must resolve once through the owner's event log. Ownership is distinct from processing workload. The current local `SharedWorld` event/snapshot model and stable entity IDs are preparation for this architecture, **not an implemented networking transport**.

The intended shared population policy applies to trees, gatherable resources, wildlife, and enemy mobs: each D20 face defines per-type target populations/densities and tolerances; chunk quotas and seeded candidates are derived consistently, and depleted populations replenish at new valid locations hidden from all players. The live resource handler currently supports seeded streaming for Meadows trees, grass, sticks, and stones; fully integrated replenishment and mob population/behavior remain planned. Standing trunks are intended to push a colliding player back slightly without causing a chop; automatic axe harvesting is separate. Felled 4-meter trunks topple, lose foliage, and fly toward the player who made the final hit, shrinking before the inventory award.

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
- **Player attacks:** Players cannot attack or destroy camp structures, including the bonfire itself. They can attack **only the bonfire's stored fuel**, destroying that supply instead of accelerating its burn. When fuel runs out, the camp loses bonfire protection; its structures remain standing.
- **Owner's map marker:** A burning bonfire anchors the camp to **its owner's own map**. If the fire goes out through neglect, that camp's marker disappears from the owner's map. This is a loss of navigation, not an instantaneous deletion of the building.
- **Finding a lost camp:** The original structures remain in the physical world if they have survived. To recover a neglected camp, its owner must physically find it again and relight the fire; the map does not simply guide them back to it.
- **NPC destruction and raiding:** When protection is lost, roaming NPC enemies may attack and destroy unprotected structures. An attacking player cannot directly destroy or loot the camp: even after extinguishing its bonfire, the attacker must wait for NPC enemies to destroy the structures before anything can become available to claim or loot. Fuel depletion alone transfers nothing.
- **No arbitrary abandonment deletion:** Camps are reclaimed by danger and loss of maintenance, **not** by an artificial inactivity countdown. An abandoned camp persists only as long as its actual structures survive.
- **Village maintenance:** Neighbors can add fuel and defend nearby structures, allowing active communities to keep settlements alive. Even fueling a rival's bonfire is allowed if a player chooses to spend the effort.

The intended **no-outcamping rule** emerges from these interconnected mechanics: camps require ongoing labor, bonfire protection, and defense; neglect removes the owner's map marker and exposes the buildings to the hostile world. No universal timer, claim-expiration menu, or permanent safety guarantee is required.

## Meadows-only starter implementation

During the initial world prototype, **Meadows (F06) is the sole populated starter biome**. The other nineteen D20 faces have individual ground colors, no resources, and remain navigable without biome-specific enemies or settlements. The 20-face biome plan remains a future design, not current generated gameplay. The prototype uses 4-meter harvested logs and 4-meter cabin wall modules. This does not imply a complete crafting/building implementation.

Physical terrain surface queries are cached in deterministic **32-meter world-space chunks** as an initial streaming layer, independent of graphics LOD. Chunks may be discarded from memory and regenerated from the same seed. This is not yet a full volumetric crust or immutable full-resolution D20 collision mesh; caves, local cavity triangulation, persistence of terrain modifications, and complete per-chunk physics lifecycle still require implementation and validation.

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
Twenty D20 root faces recursively split into four triangles. Face directions are normalized radially, then displaced by the shared heightfield. The root edge is a parameter: **256 m currently**, formerly 8192 m and 4096 m; none is fixed. The target finest nominal edge is around 1 m and the needed LOD count derives from log2(root edge) (currently 8). The collision/octree extent must also grow with the planet and maximum possible relief.

## Layered geography
Seeded 3D value noise is sampled on the unit sphere so wavelength and amplitude scale with planet radius. Very broad layers establish ocean basins and highlands. A smooth elevation gate activates foothill hills, mountain ridges, detail and crevices without feeding fine noise back into its own biome classification. Radial height remains bounded away from the planet center. Sea level is a separate fixed `RADIUS - 1 m` datum, not an automatically recomputed water percentage.

## Terrain LOD and seam handling
Current runtime (`web/src/world.js`): persistent D20 four-child hierarchy; player-centered LOD targeting based on distance to node footprint and logarithmic distance falloff; stable player anchor addressing avoids mesh-set reselection every movement frame. Render nodes are independently subdivided to their requested detail, with cached geometry keyed by node address and detail. New meshes stream at most one per frame during ordinary updates, with bounded cache eviction. Prior to 2026-10-13, triangle edges used 12 m downward skirts; the current source removes them and conforms coarse border geometry to fine-neighbor subdivisions. The active renderer has no shader morph, screen-door fade, or ghost-mesh transition despite descriptions in older notes.

**Implemented renderer change (2026-10-13; not yet device-validated): fine-LOD-owned seams.** The finest render node touching a boundary defines the exact intermediate vertex locations and seeded radial heights. Its coarser neighbor must insert matching edge vertices using the same recursively normalized midpoint subdivision (not endpoint linear interpolation) and `TerrainHeight` sampling, then locally triangulate the coarse border without refining the coarse interior. Mixed-LOD adjacency across D20 root faces counts as well. A change in neighboring LOD must be reflected in the geometry-cache key or cause targeted invalidation; stale seam topology is unacceptable. Preserve the existing selection system, streamed mesh work, bounded caching, and high frame rate. This change affects visual mesh topology only; physics, collision, and water remain independent.

## Render coverage during LOD replacement (2026-10-13)
`WorldTerrain` first creates a complete low-detail 20-face globe. Subsequent LOD targets are prepared as hidden cached meshes while the last complete generation remains displayed, then swapped atomically once all requested geometry is present. The visible set and currently requested set are tracked separately, and neither visible meshes nor the permanent fallback are evicted. Neighbor seam cache signatures track inserted vertex positions, and near-start mesh creation receives the same seam configuration as later updates. This prevents missing-coverage holes during incremental builds; seam topology, frame cost, and the time required to stage an entire new generation still require on-device validation.

## Solid octree and local physics
The implicit octree tests occupied static cells mathematically against a shared radial solid boundary and exposes queries without constructing a global set of cube objects. A separate local `SphereSurface` query constructs outward-facing thin Box3D hull patches near player and demo cubes. `PhysicsWorld.syncStatic` caches nearby regions and adds new support before retiring stale contact bodies. This prevents distant static geometry from becoming thousands of Box3D actors. Frame gravity points toward the planet center. The capsule uses real contact resolution, not renderer raycasts.

## Water and swimming
**Existing prototype behavior, not the final terrain-water design:** The water mesh is a transparent animated sea-level icosphere; no underwater fog. Water occupies open space above submerged ground. A capsule submerged fraction controls buoyancy and radial drag; forward input and camera pitch permit diving. Ocean rendering and shore-edge masking are areas for further validation, particularly with terrain fade transitions.

## Camera and globe navigation
A player-local tangent frame is parallel transported across the spherical world to preserve heading independently of any fixed geographic pole. Camera distance follows a log-scaled vertical slider; orientation lerps from third-person chase toward outward-radial globe overhead. Movement remains player-relative at any scale. Near clipping starts at 1 m and increases at large camera altitude to improve depth precision, while planet-scale zoom caps fine terrain subdivision.

## Intentional boundaries
Current experience is a diagnostic engine prototype, not a finished planet renderer. Some design notes in `prototype-architecture.md` describe earlier historical milestones, not present implementation. Do not reinstate old constants or pretend older static-planet notes are active requirements.

## Quiver Mobile title-screen entry (2026-10-13)
Game startup runs behind a `QUIVER MOBILE` title screen with live readiness stages. After renderer, full initial LOD mesh generation, player physics, scenery, and first-frame rendering are ready, `START GAME` becomes available. Only player activation dismisses the title and enables gameplay controls and the Admin/Inventory UI. Engine initialization is never delayed by a cosmetic timer; any initialization failure holds the title and displays the error. This is a startup/UI/input gate independent of terrain and physics topology. Device behavior still needs verification.
