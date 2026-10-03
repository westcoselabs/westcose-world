# Sea Caves and the Climbable Lighthouse (V1)

The hidden beach is gone. In its place a rock headland rises over the old cove, with a cave system inside it. You enter from the public beach through a rebuilt tunnel beneath the lighthouse. A big central clearing opens onto the ocean through a wide window in the sea cliff. The lighthouse doubles in height, and an outside stair winds up to a balcony where the "You found the quiet side" field note now waits.

V1 is the place only. The Grotto keeps a clear arena disc for a later zombie-pirate survival game; there is no game code and there are no pirate props yet.

The approved drawing set (plan, sections, overlook view, stair options) is `docs/design/sea-cave-approval/` ([artifact](https://claude.ai/artifact/XPbBMiQGU8Bj78Lc5cZTjF)). It was approved as drawn on 2026-10-02, decisions 1–5:

1. A headland over the whole cove.
2. A Grotto of 18 × 14 m.
3. An ocean window 12.4 m wide.
4. A stair of 1.5 turns.
5. Low rocky shore north of the headland.

## Why the old cave was rebuilt

The old underpass was authored in chart coordinates. When the mountain update doubled the planet's radius (36 → 72), a chart metre of z stretched toward a physical metre, and the cape stretched about 1.6× north–south.

A filter added in that same update (`reachesLanes`) deleted any wall piece whose fitted box came near the walking lanes. On a sphere the upper walls lean inward, so 35 of the 108 wall pieces vanished. That left holes into the hill and one missing side wall.

The new caves avoid both failures:
- They are authored in physical metres in a local frame, `data/local-frame.ts`, built the same way as `PARK_FRAME`.
- Their walls and collision come straight from one analytic volume, with no fitted boxes.

## The place

All positions are local metres: origin on the lighthouse axis, u east, v north. Widths are measured rock to rock.

| Room | Shape | Floor | Clear height |
|---|---|---|---|
| Sea Cave Tunnel | Arched, 3.6–4.2 m wide; beach mouth → beneath the lighthouse foundation | −0.1 → 0.3 | 4.0 |
| Undercroft | Fork chamber | 0.3 | 3.9–4.9 |
| The Crawl | Wide (5–6.5 m) and low | 0.3 → 0.6 | 3.1–3.3 |
| The Slot | Narrow (1.7–2.4 m) S-curve through the seaward rock | 0.3 → 0.6 | up to 8 |
| The Grotto | 18 × 14 m dome, rising toward the sea; four rim pillars; a 10 m arena disc kept clear and flat | 0.6 | 5.6–9.6 roof |
| Ocean Window | Ledge the full width of a 12.4 m arch, up a 5.8 m ramp; boulder lip | 0.6 → 2.5 (3.3 m above the sea) | arch top 9.0 |
| Twin Arches | Two passages around a great pillar | 0.5–0.6 | 4.2–4.4 |
| Tide Pool | Dead-end chamber with a still pool | 0.5 | 3.8–5.2 |

The rooms form two loops:
- Undercroft → Crawl → Grotto → Slot → Undercroft.
- Grotto → Twin Arches → Tide Pool → Grotto.

**The headland.** It rises from about 3 m at the town edge to 11 m over its sea cliffs.
- It stays clear of the Cliff Cul-de-sac streets and the lighthouse trail.
- Every cave roof has at least 1.2 m of rock above it, except at the two openings.
- Its top is walkable rock benches with patches of salt scrub.

**Trade-off from the overlook.** From the Cliff Cul-de-sac overlook the headland now closes the sea view. On a planet this small the sea horizon sits 16° below eye level, so any nearby rock hides it. This was decision 1.

**The lighthouse:**
- A 16-sided tapering shaft with red bands, plus a glazed lantern room and a cone roof. The top is 30.5 m above the sea.
- The stair is 1.3 m wide and makes 1.5 turns (37°). It starts where the trail arrives, at the foot of the stair, and ends on a balcony 26 m above the sea.
- The walked surface is a smooth ramp under 110 drawn treads.
- Where the stair passes under the balcony, the balcony floor is left open as a hatch.
- The beam sweeps slowly; it is static with reduced motion.

## Lighting

The whole cape is on the planet's dark side: the fixed sun is 28° below the horizon at the lighthouse and about 8° at the Grotto. Real sunlight can't come in through the window, so the cave light is designed:

- **Baked light.** The rock is unlit (`MeshBasicMaterial`) with its light baked into vertex colours. Each face is lit by how far a visitor would walk from the window and from the mouth, which way it faces, and how tucked into a corner it is. There is a floor of 0.3, so nowhere goes black. Window light is cool and mouth light neutral.
- **Light shafts.** Four faint additive beams fall from the window into the Grotto. They fade in from inside the reveal, so from the sea they never read as panels.
- **Cave mix.** Down in the caves, `CoastalLighting` eases in a damped cave mix over the first 8 m past the mouth: the sun fades out, ambient and hemisphere light drop, and the fill light swings round to come in from the window.
- **Layered lantern anchors.** Lantern anchors carry a support layer: `seacave:window`, `seacave:grotto` and `seacave:mouth` light only a visitor in the caves, and `lighthouse:lantern` only one on top.

## Architecture

| File | Role |
|---|---|
| `data/local-frame.ts` | Azimuthal-equidistant local frame (u east, v north, physical metres) |
| `data/sea-cave-layout.ts` | Layout data only: passages, chambers, pillars, mouth, window, headland footprint, arena |
| `data/sea-cave.ts` | The analytic volume: plan signed-distance field, floor and ceiling, zones; the headland and rock cover over the terrain |
| `data/sea-cave-openings.ts` | Convex cut prisms at the mouth and the window; terrain clipping, seal panels and their camera registry |
| `data/sea-cave-mesh.ts` | The visible rock, built from the volume: floor, ceiling, wobbled walls, stalactites, boulders, window lip, tide pool, light shafts and the light bake |
| `data/lighthouse-tower.ts` | Tower, stair and balcony dimensions; stacked walking support, camera test, field-note and stair-foot points; hidden boxes for the skateboard |
| `scene/SeaCave.tsx` | Draws the baked rock and the shafts (2 draw calls) |
| `scene/LighthouseTower.tsx` | Draws the tower, stair, balcony, lantern and beam (5 meshes) |
| `runtime/planet-collision.ts` | Cave support (solid outside the plan; the mouth is the only way out), the lighthouse stack in `upperSupportAt`, sliding on solid faces, and a camera that also tests its end point |
| `data/town-surfaces.ts` | Blends the headland into the terrain, and colours its rock |
| `scene/TownLandscape.tsx` | Cuts terrain at both openings, keeps the window open on coarse terrain, keeps skirts out of the openings; the town region now reaches world x 78.5 |

**Walking:**
- In the `tunnel` layer, anywhere outside the cave plan is solid rock. That is why nobody can step off the window lip into the sea.
- The only way out is the beach mouth. Its apron hands back to the outdoors once the beach is level with the visitor.
- Blocked moves slide along rock and masonry, using the plan's gradient as the wall normal.
- On the lighthouse, `upperSupportAt(direction, footRadius)` picks the highest surface within a step of the feet: terrace, stair or balcony. Three things count as solid:
  - the shaft;
  - anywhere with less than 2.1 m of headroom (which makes the stair's low end a masonry base);
  - any drop of more than 1 m off the structure.
- Spawns and teleports use the destination's own height to choose a level.

**World integration:**
- The field note keeps its place id `'beach'`, so discoveries already saved on a device carry over.
- The skateboard can't be equipped in the caves or on the lighthouse.
- The `'cave'` route, `COASTAL_RADIO`, `PENINSULA_SAND`, `PENINSULA_INNER_CLIFF`, `PENINSULA_COVE` and `PENINSULA_CAVE` are removed, along with `data/peninsula-cave.ts`, `data/peninsula-cliffs.ts` and `scene/PeninsulaCliffs.tsx`.

**Debug API** (`window.__WESTCOSE_WORLD__`, development only):
- `spawn('cave')`: on the beach two metres outside the mouth.
- `spawn('grotto')`: the middle of the Grotto, facing the window.
- `spawn('lighthouse')`: the trail end, facing the stair foot.
- `spawn('lighthousegallery')`: on the balcony beside the field note.
- `spawnAt(x, z, facing, layer, elevation)` takes an optional elevation to land on a raised surface such as the stair or balcony.

## Validation

- `npm run test:seacave` (`scripts/check-sea-cave.mjs`) passes 14/14:
  - **Plan dimensions:** headroom ≥ 2.8 m, the Crawl between 2.8 and 3.4 m, floors dry, slopes ≤ 35°, rock cover ≥ 1.2 m.
  - **Clearances:** the headland stays clear of the town, the trail and the terrain edge; the arena disc is clear and flat.
  - **Walks:** every route is walked with the real movement step.
  - **Fall-proofing:** 40 pushes at the window lip and 220 random wall pushes.
  - **Walls:** sliding, plus a swimmer who can't climb in at the window.
  - **Layers:** layer stacking under the lighthouse.
  - **Cave camera:** 14,400 camera rays never end in rock.
  - **Stair:** climbed and descended in three lanes with no blocks, a rise ≤ 0.32 m and a drop ≤ 0.22 m; stair and balcony edges hold; the shaft is solid; the masonry base and the field note are reachable only on the balcony.
  - **Tower camera:** never ends inside the tower.
  - **Openings:** both are open through the drawn terrain (detailed and coarse).
  - **Mesh:** no cave-mesh vertex inside the walkable space below 2.55 m.
  - **Names and lights:** zone names and the layered lights.
- `node scripts/check-sea-cave-layout.mjs` pins the layout data to the approved drawing snapshot.
- `npm run test:planet` passes 24/24. The lighthouse and hidden-beach tests are replaced, and the old underpass tests moved into the cave suite.
- `npm run test:skate` (7/7), `test:snowboard` (11/11) and `test:fishing` (13/13) are unchanged.
- **Playwright:** `tests/sea-cave.spec.ts` passes 3/3:
  - walk in from the beach, cross the Grotto onto the window ledge and push at the lip;
  - walk out through the mouth;
  - climb the stair, read the note, test the rail.
  - It replaces `tests/peninsula-underpass.spec.ts`.
- **Retired:** `scripts/check-peninsula-routes.mjs` and `scripts/check-single-cove-layout.mjs`; their surviving checks moved into the cave suite.
- **Still failing as before (your call):** `check-peninsula` (it reads a stale source fragment, and it also guarded the old 12 m tower model) and `check-approved-preservation` (stale baseline).
- **Stale historical tooling:** the old approval review scripts for the single cove and the underpass (`capture-peninsula`, `review-peninsula`, `snapshot-single-cove-proposal`, `concept-review-viewpoints`, `review-globe-concept`) read the removed tunnel data and no longer run.

## Out of scope for V1

- The zombie-pirate survival game: spawning, enemies, rounds, scoring and UI. The arena disc (`SEA_CAVE_ARENA`) and the Grotto's rim pillars are its starting point. The style guide still says "avoid pirate scenery", which the game phase will revisit.
- A walkable path or lookout on top of the headland. You can walk the rock, but nothing marks a route.
- A second cave entrance from the town.
- Sound in the caves.

## Tuning notes

- **Cave brightness:** `CAVE_EXPOSURE`, window strength 1.02 over 11 m, and mouth strength 0.85 over 6.5 m, all in `data/sea-cave-mesh.ts`. In `scene/CoastalLighting.tsx`, `CAVE_LIGHT` sets ambient 0.45, hemisphere 0.22 and fill 0.8.
- **Headland look:** `rocky()` in `data/sea-cave.ts` sets the bench height (1.4 m) and the outcrop amplitude.
- **Stair:** `LIGHTHOUSE_TOWER.stair.turns` is safe to change, since everything derives from it. Re-run the approval render and `test:seacave` after any change.
