# Town and coast rework

This rework covers:

- A longer pier.
- A beach that reads as a real beach.
- A grander courtyard whose two halls open onto it.
- Bigger shops.
- Cul-de-sacs at the street ends.
- A real two-storey motel.
- The lighthouse, cave and hidden-beach system moved east to make room.

## Layout

| Area | What changed | Source |
|---|---|---|
| Pier | Walkway out to z −56. The fishing head is 12 m by 11 m and reaches z −67. Lanterns stand every 6.5 m along the walkway. There are benches along the rails, a bait shack and a coin-op viewer | `data/pier-layout.ts`, `scene/pierGeometry.ts` |
| Map seam | Moved from z 380 to 360, so the long pier head is 25 m clear of the chart cut | `data/world-map.ts` |
| Beach | A new cross-section: dune hummocks, a dry upper beach, a berm, a gentle wet foreshore and a long shallow shelf. It has its own sand, wet-sand and shallows colours | `data/town-surfaces.ts` (`beachProfileAt`) |
| Surf | An animated strip draped on the wet sand and the shallows: a running swash line, foam crests rolling in and turquoise shallow water | `scene/Beach.tsx` |
| Beach props | Two lifeguard towers, umbrellas with towels and loungers, a volleyball court, a fire pit, board racks, bins, a shower, dune grass and a row of palms. All solid props collide | `data/town-props.ts`, `scene/Beach.tsx` |
| Courtyard | The plaza widened to x ±9.2. It now has a fountain with the bronze wave, a compass-rose floor, corner planters with palms, lit bollards, string lights with banners and a direction post. The plaza has no benches; the cul-de-sac palms keep their seeds (`Furniture.seed`) | `data/downtown-layout.ts` (`COURTYARD`, `PLAZA`), `scene/Downtown.tsx` |
| Studio Row Gallery | 10.8 m by 9.6 m and 7.6 m tall. It faces east into the courtyard with a full glazed shopfront, timber canopy, swan-neck lamps and blade banner. Its Main St side has display windows and a mural. Inside: large works, track lights and a model of the world on a plinth | `data/town-layout.ts`, `scene/kit/facades.ts`, `scene/interiors/rooms.ts` |
| WestCose Shop | The clothing store. The same size, 7.2 m tall, facing west into the courtyard with a roller-door entrance and steel awning; a rolling rack and a NEW DROP A-frame out front. Inside: a garment wall with caps, racks along both side walls, the cash wrap, folded-tee tables, a fitting room and mannequins in the windows. E opens the clothing panel (`shop`) | same, plus `scene/kit/apparel.ts` |
| WestCose Studio | Services moved to an office upstairs at Palm Court on Palm Ave. A plaque by the street door reads WESTCOSE STUDIO / SERVICES / UPSTAIRS, and E there opens the Services panel | `data/town-layout.ts` (`doorSign`), `scene/kit/buildings.ts`, `data/planet.ts` |
| Skate Shop | 9.2 m by 9.2 m, with a wider deck wall and a mini quarter-pipe display | same |
| Suds Laundry | Removed | `data/town-layout.ts` |
| Motel | A glazed lobby (the About room) under a BUILT BY THE SEA canopy, and a two-storey room wing set back for a ground walkway. The wing has an upper walkway with railing, rooms 101–103 and 201–203, a stair at the alley end and an end-wall mural. A neon pylon on the Pier St corner reads WEST COSE / MOTEL / NO VACANCY under a starburst | `data/town-props.ts` (`MOTEL`), `scene/kit/facades.ts` |
| Cul-de-sacs | Main St ends in the Cliff Cul-de-sac, with a palm island, an overlook railing and binoculars, and the lighthouse trailhead. Palm Ave ends in the Palm Cul-de-sac. Each is a curbed turning circle with a sidewalk ring and grindable curbs | `data/downtown-layout.ts` (`CUL_DE_SACS`), `scene/Downtown.tsx` |
| Graffiti Alley and Alley Room | Moved east beside the motel stair. The graffiti wall now stands on the boardwalk by the lab | `data/town-layout.ts`, `data/concept-landmarks.ts` |

## The peninsula move

The lighthouse cape, the cave, the hidden-beach cove and its cliffs are still authored exactly as approved, in the original chart coordinates. `check-single-cove-layout` still compares the polygons with the approval drawing.

`data/peninsula-frame.ts` places that system with one rigid rotation of the globe. The pivot is the public beach by the cave mouth, authored at (30, −29); it moves 17 m east. Every physical distance, height, slope and tunnel section is therefore unchanged.

- **World queries** map back into the authoring frame: `peninsulaLocal`, `inPeninsulaRegion`, `peninsulaHeightAt`, `peninsulaBlendAt` and `peninsulaCoastDistance`.
- **Authored geometry** maps forward with `placeVector`: cave rings, cliff wedges and the lighthouse frame.
- **Anchors in world chart coordinates:** `PLACED_LIGHTHOUSE`, `PLACED_COVE` and `PLACED_CAVE_POINTS`.
- **Terrain inside the region and a 6 m margin around it** is the original island substrate, sampled in the authoring frame (`peninsulaTransplantWeight`). Both seams therefore join the new town land smoothly.
- **The present island** (`islandTerrainAt`) widens the town shelf and the beach east to meet it. The old headland now lives only in the frozen `existingIslandTerrainAt`.
- **The obsolete coastal detour** of the lighthouse trail, kept only to preserve old terrain shoulders, is gone.

## Validation

- `npm run test:planet` passes 27/27. It now pins the long pier (tip −67, head 12 × 11) and samples the cave through the placement rotation.
- `test:skate` passes 7/7 and `test:snowboard` passes 4 + 11.
- `check-peninsula-routes` passes 13/13. It works on placed points, and the lighthouse trail must now start on the Cliff Cul-de-sac sidewalk. Before this rework it failed at the old town handoff.
- `check-single-cove-layout` passes.
- Playwright passes 25/25. The pier walk polls allow 22 s for the longer pier, and the underpass test walks the placed cave with native controls.

Two preservation checks fail, as they already did before this rework:

- `check-approved-preservation`: its protected baseline predates the skate rework.
- `check-peninsula`: it reads a stale source fragment.

Re-baselining either one is a separate decision.

The development debug API adds `setCamera({ from, to })` (chart x, z and height) for review captures; `null` restores the follow camera.
