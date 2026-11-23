# QuiverMobile — Game Bible

The single source of truth for **what the game is and how it plays**. Engine and build detail belongs in [DESIGN.md](DESIGN.md).

Everything here is design intent unless it is marked **Implemented**. A rule being written down is not a claim that it is already in the game.

---

## 1. The game in one paragraph

QuiverMobile is a survival-crafting game of free exploration on **one continuous spherical planet**. The planet is an icosahedron: twenty triangular faces, each a distinct biome, all walkable without loading screens or level selects. Players gather and craft, raise camps on hostile ground, fight with automatic action combat backed by deep long-term character growth, and unlock bosses in a Metroidvania-style progression of capabilities. QuiverGL is the name of the planetary engine technology; there is one game, not two.

## 2. Design pillars

1. **One planet, no seams.** Every biome is reachable on foot. Travelling is the content.
2. **See it before you can survive it.** Players may walk into a biome they are not equipped for. Danger is geographic, not gated by menus.
3. **Camps are built and defended, never claimed.** No claim flag, no expiration timer, no permanent safety.
4. **Hands-on but forgiving building.** Logs snap, openings cut themselves, upgrades extend existing buildings.
5. **Graduated progression.** Growth opens new options; it is not just larger numbers.
6. **Everything persists.** Building, unbuilding, inventories and camp state save automatically. There is no save button.

## 3. The planet

- Twenty D20 root faces, each recursively subdivided for detail. **Implemented.**
- Each face **is** a biome: its own ground, vegetation, resources, hazards, mobs and atmosphere.
- The planet is a **solid volume**, not a hollow shell: a permanent spherical bedrock core surrounded by a substantial crust, with caves, tunnels, overhangs and craters possible inside the crust. **Digging and deformable terrain are not committed features.**
- Water occupies open space that is actually supported or enclosed by terrain — ocean, lakes, rivers, crater pools and underground water may sit at different elevations. Water is never solid ground.
- World-wide settings (planet size, gravity, world age, celestial system) belong to the planet. Local terrain, climate, ecology and mob roster belong to a biome. Live conditions (today's weather, current mob positions) are simulated state, not a frozen biome property.

## 4. The twenty biomes

Each biome is described by one **parameter set**, interpreted by shared systems — never a bespoke terrain or spawn engine per biome:

- **Terrain and surface** — ground colour/material, elevation, shape and noise, slope, roughness, geological features. These must feed the one authoritative terrain/collision definition so that what you see is what you stand on.
- **Climate and weather** — temperature, humidity, wind, cloud, fog, precipitation, and the ranges for changing weather.
- **Water and hazards** — biome rivers, lakes, pools, environmental dangers.
- **Vegetation and resources** — species, appearance, density targets, tolerances, quality, replenishment.
- **Mobs** — which mob types may appear, how many, where, territories, senses, attributes.
- **Atmosphere and gameplay** — local sky/fog/audio character, environmental effects, biome-specific progression constraints.

Conditions should blend across biome boundaries rather than switching at an invisible edge. Exact ranges and blending rules are undecided.

**Progression order:** **Meadows** is the easiest and the starting biome. **Black Forest** is next. The remaining eighteen names, their order, flora, enemies and bosses are open.

**Implemented:** per-face names, ground colours, resource densities and grass style in `web/src/engine/world-config.js`. Only Meadows is populated; the other nineteen faces are coloured and empty but fully walkable.

## 5. The two-resource rule

No biome is meant to be self-sufficient. Each biome supplies most of what its own progression needs, **except two essential resources** that must be found elsewhere — and the exchange rolls forward:

1. **Meadows** lacks two progression-essential resources, pushing the player toward **Black Forest**.
2. Each next biome introduces **two new materials** unavailable in the biome before it.
3. That same biome **stops providing two resources** the previous biome depended on.
4. The rolling exchange continues along the progression sequence, so living in any one biome still requires visiting its neighbours.

"Drops" means *is not locally available*, not that the material becomes useless or is deleted from inventories. Resource names, recipes and how the final biome closes the loop are undecided. This rule is a constraint on resource placement and crafting dependencies, not a mechanic in its own right.

## 6. Gathering, tools and materials

- **Trees:** axe contact on trunk, branches or foliage fells them. Without an axe equipped a tree is scenery. **Implemented.**
- A **felled 4-metre trunk** topples, sheds foliage, flies toward the player who landed the final hit, shrinks, and is awarded to the inventory. **Implemented.**
- A **standing trunk** nudges a colliding player back without chopping itself. The current single-bounce response is temporary and not the intended feel.
- **Materials:** 4-metre logs are the standard unit. Also fibers, sticks and stones from ground resources; grass, rocks and mineral deposits are further biome resources (rock and deposit contracts exist, they are not spawned yet).
- **Harvesting** is by tapping the world. Selected resource, tool requirement and yield are resolved per type.
- **Replenishment** is hidden: depleted populations regrow at new valid sites, never in front of a player.
- Resources, vegetation, wildlife and enemies share **one** population model: per-face per-type targets and tolerances, deterministic seeded candidates, streamed loading near players, stable IDs, persistent harvest/death state, and unloading at distance.

## 7. Survival and crafting

Players gather materials, process them at facilities (a furnace for metal is the standing example), and craft equipment. The **inventory** is the single interface for equipment and contextual tools — there are no separate build or craft menus.

**Implemented inventory slots:** tools `Axe`, `Hammer`, `Scythe`; resources `4 m Logs`, `Fibers`, `Sticks`, `Stones`. Logs show count and average strength.

Unbuilding is *not* a recycling loop: ordinary logs, sticks and stones are discarded when a structure is unbuilt. **Salvage** exists for crafting — rare or unique items and components may be recovered. Recipes and eligibility are undecided.

## 8. Combat, perception and progression

Players and NPCs perceive the world with the same senses. No NPC knows anything it could not see or hear.

- **Earshot:** a spherical hearing range. Noise can alert a mob and turn it toward the source.
- **Eyeshot:** a directional vision cone. A target must be inside it to be seen.
- **States:** *Patrol*, *Alerted*, *Attacking*. Response per mob type; no elaborate investigation or tactical planning.
- **Territories:** mobs spawn outside one another's territories but may wander into each other's senses and fight. Hostile mobs will attack stronger foes without judging their chances.
- **Player attacks** are automatic in the *Vampire Survivors* sense: the shared perception system plus each attack's real reach decides the target, and an attack only fires when something can actually be hit.
- **Progression** is *World of Warcraft*-style breadth and depth over a long arc: capabilities, equipment, resources and character growth all contribute.
- **Bosses** are gated Metroidvania-style by capabilities and achievements. A one-boss-per-biome rule has **not** been established. Boss identities and unlock conditions are open.
- **Meadows** is the tutorial biome; even its strongest enemies should be easy.

## 9. Camps and comfort

- The **bonfire** is the first structure and establishes the camp; it is worth **1 comfort**. It costs a hammer and **12 logs**. **Implemented.**
- Advanced building is only possible **inside the bonfire's influence footprint**, not anywhere in the world. Bonfire influence radius is currently 5 m. **Implemented as a radius; comfort-driven expansion is not.**
- One completed **4×4 m hut** adds **1 comfort**, taking a starter camp to 2.
- Every **unique** completed feature of a camp may contribute comfort; repeating the same feature does not stack. Values beyond these two are undecided.
- More comfort means a larger influence area, which allows more building.
- All construction, unbuilding, inventory and comfort state is **automatically persistent**.

## 10. Building

Building is hands-on, quick to start and moderately layered — explicitly **not** a carpentry simulator.

- **4-metre logs** are the modular unit. Stack logs into walls with automatic alignment and corner connections; fill the floor, add a roof, and you have a working cabin.
- **Three openings per wall:** each 4 m wall has left, centre and right positions for a door or window. Build the solid wall first, then designate the cut-out with an axe; the game performs the cut and finishes the opening. No per-log trimming, no notch cutting.
- **Expandable:** add rooms, walls and roofs to an existing building without starting over.
- **Prefabs:** ready-made sections can be dropped in as an alternative to placing every log, and must remain compatible with hand-built sections so a prefab cabin can be extended.
- **Interiors:** furnishings, storage and crafting equipment can be placed inside.
- **Placement:** select a piece; it snaps to logs and aligns in 90-degree increments.
- **Removal:** structures cannot be damaged by player attacks. They are deliberately **unbuilt** when upgrading or moving.

## 11. Bonfires, fuel and the no-outcamping rule

The world is hostile and genuinely safe places are scarce. Bonfire protection is the whole basis of camp life.

- **Any player may add fuel to any fire** — their own, a neighbour's, even a rival's. No ownership, invitation or alliance is needed. Fuel costs gathered effort.
- **Fuel is time:** one log burns for one hour, up to **720 hours** stored. **Implemented.**
- **Players cannot destroy structures.** They can attack the **stored fuel** and burn it away, which is the only way a player can strip a camp's protection.
- **Owner's map marker:** a burning bonfire pins the camp to **its owner's** map. If the fire goes out through neglect, the marker disappears — a loss of navigation, not an instant demolition.
- **Structures remain.** When protection lapses, roaming hostile NPCs may destroy unprotected buildings. An attacking player still cannot loot the camp: they must wait for NPC destruction before anything becomes claimable.
- **Recovery** means physically finding the place again and relighting the fire.
- **No inactivity timer.** Camps are reclaimed by danger and lost maintenance, not by an abandonment countdown. An abandoned camp lasts exactly as long as its structures survive.
- **Villages:** neighbours can fuel each other's fires and defend each other's buildings, which is what keeps a settlement alive. This is the intended **no-outcamping rule**: safety is ongoing labour, not a permanent claim.

## 12. Death, respawn and resting

- **Resting:** standing near a burning bonfire without moving makes the character **sit**. That moment sets the camp as the respawn point. **Implemented.**
- **`/die`:** respawn at the **most recently used camp or bonfire**. If no camp exists yet, the command refuses and says so. **Implemented.**
- **`/suicide`:** reset character progress and respawn at the fixed **Meadows start**. **Implemented.**
- Building a new bonfire immediately sets that spot as your respawn point. **Implemented.**
- A full combat death/respawn rule (what death costs, where you wake up in a boss fight, corpse recovery) is **not designed yet**; `/die` is the current stand-in.

## 13. Multiplayer and villages

- **Owner-hosted world:** the player who creates the world owns the save and must stay connected for the session to exist.
- Every device simulates its own experience; peers exchange shared world events; conflicting harvest claims resolve once, through the owner's event log. Ownership is about authority, not about who does the processing.
- **Independent players, emergent cooperation.** There is no formal party: people explore, fight, trade, gather and defend together because they choose to.
- **Camps are individually owned.** Neighbouring camps can become a village without merging ownership.
- **Invitations** are temporary and owner-present. A visitor may share facilities and resources the owner allows while both are there; it never transfers ownership or grants standing access.
- Helping a neighbour — using their furnace, say — is settled between players. No mandatory service fee.
- Larger groups can keep several fires burning, split gathering work and defend the settlement; newer villagers can contribute fuel before they can build advanced facilities.

## 14. Interface

- Two matching collapsible panels: **Admin** across the top and **Inventory** across the bottom. One expands to half the screen at a time; the gameplay canvas resizes to the clear middle.
- The **Admin panel** is the owner console. Commands are **registered handlers** — never arbitrary evaluation — and only the world owner may run them.
- The Inventory is the equipment screen; tools are chosen by tapping a slot. Axe, hammer and scythe select the active tool.
- **Startup:** the game initialises behind a `QUIVER MOBILE` title that reports live readiness. `START GAME` appears only when rendering, world, LOD, scenery, physics and a first frame are all ready and nothing has failed. Input stays locked until then. **Implemented.**
- **Console commands that exist today:** `help`, `clear`, `renderon` / `renderoff [layer]`, `reset`, `wipe confirm`, `stuck`, `suicide`, `die`.

## 15. The starter slice (what you can play now)

- **One populated biome:** Meadows (face 06) with trees (~4,500/km²), grass (~36,000/km²), sticks (~12,000/km²) and stones (~8,000/km²). Nineteen coloured, empty, walkable faces around it. **Implemented.**
- Playable loop: explore, harvest trees and ground resources with the axe, gather logs, equip the hammer, build a 12-log bonfire, rest beside it to set your respawn point, add fuel with logs, use `/die` to return. **Implemented, but not yet verified in a device run.**
- Not in the build yet: combat, mobs, bosses, crafting facilities, cabins beyond the bonfire, other biome contents, multiplayer transport, weather, day/night.

## 16. Open design questions

- Names, order and character of the eighteen biomes beyond Meadows and Black Forest.
- The two-resource exchange: actual materials, recipes and how the last biome closes.
- Mob archetypes, population numbers, behaviour parameters, combat numbers.
- Boss identities and unlock conditions; whether bosses are per-biome at all.
- Comfort values per feature, and how influence grows with comfort.
- Salvage recipes and eligibility.
- Death rules: cost, respawn behaviour, corpse/gear recovery.
- Weather, seasons, day/night and how climate blends at biome boundaries.
- Whether terrain can ever be modified by players (currently not committed).
- Prefab catalogue and how prefab placement interacts with comfort and influence.
