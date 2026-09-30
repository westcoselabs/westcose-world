# Snowboard V1 — Phase 2: radius-72 planet and mountain revision 4

The planet radius doubled from 36 m to 72 m (4× the surface) so the snowboard mountain has room, and so the pier looks out over open ocean instead of at the back of the mountain.

## What changed

- **Planet.** `MAP_RADIUS` 72, `MAP_MAX_HEIGHT` 84, seam at z 380 (open water between the pier and the new rear shore). Layout version 8.
- **Town, pier, skate park, cove.** Unchanged chart coordinates, so building sizes and positions are the same. They look a little less wrapped. `existingIslandTerrainAt` is byte-identical; it moved to `data/island-terrain.ts` so the mountain modules can share it without an import cycle.
- **Mountain revision 4** (`data/mountain-layout.ts`). Summit at chart [0, 228], 78 m, on a new north island that reaches the rear shore at z≈306. The massif is shaped in a distortion-free frame about the summit: rounded summit, gentle bowl, steep headwall, long concave south face, rocky flanks. The lodge, ticket hut and forecourt keep their rev-3 anchors.
- **Four runs** (`data/ski-runs.ts`). Carved into the mountain with grade-limited profiles, banked into turns:

  | Run | Rating | Length | Avg / max grade | Finish |
  |---|---|---|---|---|
  | Sunday Cruise | Green Circle | ~406 m | 9.6° / 19° | Resort |
  | Lighthouse Line | Blue Square | ~315 m | 12.8° / 24° | East bluff |
  | Timber Chute | Black Diamond | ~230 m | 17.6° / 32.5° | West forest |
  | Dead Coast Couloir | Double Black | ~214 m | 18.5° / 35.9° | Resort |

  These are the Phase 2 figures. In Phase 4, Sunday Cruise and Lighthouse Line were re-routed with wide turns, which made them 308 m and 275 m; see [the QA summary](../README.md).

- **Terrain rendering** (`scene/TownLandscape.tsx`). Chunked land regions replace the full-globe grid:
  - town at 0.45 m, mountain at 0.8 m chart spacing
  - open sea skipped, since the ocean is opaque
  - normals are seam-free, taken from a one-vertex sample apron
  - skirts hide cracks between chunks and detail levels
  - both detail levels are built from one sampling pass
- **Camera.** The pier and resort summit-framing assist is gone (the summit is hidden by the planet). Globe view raises the near plane for depth precision at the doubled distance.

## Radius-driven adjustments to tuned areas

- **Lighthouse cave.** The chart-authored bend under the tower changes physical shape at radius 72, and the inner offset wall folded back into the walking lanes. Wall wedges whose boxes reach the lanes (1.5 m + capsule) are trimmed, making the turn one broad chamber as intended; the roof is unchanged.
- **Cave exit handoff.** The cap face now rises ~1.7 m beyond the exit, so the tunnel handoff window moved from 1.6 m to 2.05 m out (still inside the 2.4 m open-cut apron).
- **Lighthouse upper trail.** It ends 0.15 m further west. The tower foot spans more chart width at the larger radius, and the trail's 0.65 m edge lanes must still clear it.

## Preservation re-baseline

`check-approved-preservation.mjs` was re-recorded for radius 72. Measured against the radius-36 baseline:

- **Buildings:** only the derived lon/lat changed.
- **Protected routes:** identical.
- **Terrain:** 125 of 1023 protected samples changed:
  - 37 on the northern forest edge (z ≥ 38) where the Timber Chute run-out lands, up to 0.64 m
  - the rest around the skate park and route edges, which keep their physical widths on the larger sphere, up to 0.39 m

## Validation

- `npm run typecheck`, lint on changed areas: pass.
- `npm run test:planet`: 27/27, including new checks:
  - the whole massif is hidden from the pier and the seaward water is open
  - the runs stay inside their grade bands and are walkable end to end
  - every land point lies inside a rendered terrain region
- `node scripts/check-single-cove-layout.mjs`, `node scripts/check-peninsula-routes.mjs`: pass.
- Playwright: 18/18. The pier test now asserts the summit is not visible from the pier.
- `scripts/check-mountain.mjs` (exact rev-3 parity) was retired with the rev-3 layout. `check-peninsula.mjs` was already failing on a stale pre-mountain snapshot before this work.

## Captures

`node scripts/capture-snowboard-world.mjs` (with `WORLD_CAPTURE_URL` set to the dev server) writes `views/` and `capture-state.json`: 34 desktop and phone views, no page or WebGL errors. Key views:

- `desktop-pier-seaward.jpg`: open ocean to a curved horizon.
- `desktop-globe-town.jpg`, `desktop-globe-mountain-front.jpg`: the whole planet.
- `desktop-resort-forecourt.jpg`, `desktop-ticket-booth.jpg`: the lodge and "LIFT TICKETS · SNOWBOARD / 4 RUNS".
- `desktop-run-*-{start,middle}.jpg`: the carved runs.

Known visual issues for Phase 3:

- Run edges alias into a sawtooth on the 0.8 m mountain grid, and steep cut banks pick up the rock colour.
- The summit plateau and runs have no signs, gates or trees yet.
