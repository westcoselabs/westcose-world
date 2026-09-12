# WestCose World

A playable 3D portfolio in a compact California-inspired coastal town on a small planet. Wander through Studio Row, service alleys, a workshop yard, hidden lab, beach promenade and timber pier. Cypress and oak groves, headland trails and lookouts continue around the rest of the land. Five furnished rooms open directly into the world.

The current expansion preserves the working spherical runtime. Start with [the coastal layout](docs/world/COASTAL_LAYOUT.md) and [active style direction](docs/world/STYLE.md). The earlier Dead Coast and Planet V2 documents are retained as history; the visible name is now WestCose World.

The current [materials, lighting and planting pass](docs/world/MATERIALS_AND_LIGHTING.md) combines low amber sunset light with readable shade, warm entrance lights, worn stone and plaster, damp paving and iron drains. The original twenty town trees remain alongside 199 new trees in twenty authored groves, layered undergrowth and wall ivy.

## Run

Node.js 20.9+ (developed with Node 24 on Windows).

```sh
npm install
npm run dev
```

Open [WestCose World](http://127.0.0.1:3000/world).

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Walk | Drag the world, or WASD / arrows | Drag the world or thumb pad |
| Run | Hold Shift while walking | — |
| Look around | Right-drag | Camera follows movement |
| Explore nearby place | E or place button | Tap place button |
| See the whole planet | Globe button | Globe button |
| Field notes | Checklist button | Checklist button |
| Pause / close | Escape or controls button | Visible close / controls buttons |
| Return to entry | Controls → Return to entry | Same |

There is no persistent directory overlay. Small field notes and nearby conversations pause movement. Switching away pauses the world. Direct HTML portfolio routes remain available; unsupported WebGL browsers receive direct links.

## Implemented

- A closed sphere with central gravity and continuous tangent movement, including both poles.
- 26 primary buildings, 12 secondary structures, 21 authored town routes, a courtyard, service alleys, workshop yard, dirt road, beach promenade and raised timber pier.
- Dry waterfront setbacks, foundations fitted to the curved terrain, a beach walking loop and an Arcade on land beside the pier approach.
- Cypress and oak groves across both sides of the planet, three additional natural-ground trails and three lookouts.
- An original articulated visitor and close follow camera with building/terrain obstruction handling.
- Portrait-aware globe view with a smooth transition into walking.
- Keyboard, mouse and one-finger touch movement.
- Five physically enterable interiors: Project Studio, Workshop, Arcade, About Office and Hidden Lab; plus the Contact Post and coastal discovery.
- Validated return checkpoints with layout version 4 and device-local field notes.
- Client-only Three.js / React Three Fiber runtime loaded only for the world.
- Original procedural scenery and local fonts; no reference-site art or model downloads.
- Shared weathered PBR surfaces, coastal sky lighting and batched trees, ferns, grasses and ivy.

FightClub still needs its actual game build or launch URL. Verified service copy, contact details, case studies and brand artwork have not been supplied.

## Check

```sh
npm run lint
npm run typecheck
npm run test:planet
npm test
npm run build
```

Browser tests use installed Google Chrome through Playwright. They include real input for a complete circuit, pole crossing, steps, camera obstruction, water, interactions and emulated touch. The development fixture API is removed from production.

[Validation and actual screenshots](docs/qa/dead-coast/README.md).

[Current coast-pass checks and performance](docs/qa/westcose-coast/README.md). [Previous sunset pass](docs/qa/dead-coast-sunset/README.md). The [private screenshot gallery](https://westcose-world-screenshots.westcose-co.chatgpt.site) shows the coast and the planted hemispheres. The playable app itself remains local.

To reproduce current screenshots: run `node scripts/capture-coast.mjs` against the development server. For the production audit, start `npm start -- --port 3001`, then run `node scripts/measure-world.mjs` with the desired `WORLD_MEASURE_OUTPUT` and `WORLD_BASELINE_PATH`.

## Edit the world

| File | Purpose |
| --- | --- |
| `src/features/world/data/planet.ts` | Radius, shared terrain heights, building footprints, places and fixtures |
| `src/features/world/data/town-layout.ts` | Authored building presets, districts, routes and five interiors |
| `src/features/world/data/pier-layout.ts` | Physical deck dimensions, spherical conversion and shared surface/guard edges |
| `src/features/world/data/coastal-regions.ts` | Authored groves, headland trails and lookout locations |
| `src/features/world/scene/Environment.tsx` | Small composition of landscape, ocean and modular buildings |
| `src/features/world/scene/kit/` | Reusable facades, rooftops and batched signs |
| `src/features/world/scene/materials/` | Shared weathered surfaces and physical texture coordinates |
| `src/features/world/scene/CoastalLighting.tsx` | Coastal sky, focused shadows, haze and generated reflection environment |
| `src/features/world/scene/StreetPatina.tsx` | Authored soil beds, ironwork, patch repairs and restrained edge debris |
| `src/features/world/scene/vegetation/` | Authored planting pockets, merged geometry and restrained wind |
| `src/features/world/data/building-shapes.ts` | Shared visual/collision walls, furniture, floors and aprons |
| `src/features/world/runtime/planet-collision.ts` | Great-circle movement, surface support, walls and camera collision |
| `src/features/world/player/PlayerController.tsx` | Input, fixed simulation, avatar and camera |
| `src/features/world/WorldRuntime.tsx` | Canvas lifecycle and small HTML controls |
| `src/features/world/planet.css` | World interface styling |
| `src/content/registry.ts` | Real content shared with portfolio pages |

See [the initial repository audit](docs/IMPLEMENTATION_AUDIT.md) for the original content inventory. This is a local playable prototype, with no backend, multiplayer, connected game, or deployment.
