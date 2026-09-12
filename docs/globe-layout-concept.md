# WestCose World — globe layout concept

This is the structural review milestone, not the final art pass. The reference composition is implemented with nine reused procedural building shells, simple colored terrain, a western skate park, an eastern lighthouse and covered cave, and one real mountain on the long inland side of the globe.

## Review

The latest structural refinement is in `docs/qa/globe-refinement/index.html`, with a sampled coastline/height map and desktop/phone walking views. The earlier `docs/qa/globe-concept/` captures remain the first-pass comparison. Run `npm run dev` and visit `/world` to walk the layout.

The courtyard is the fresh-load and Return to entry destination, facing the waterfront. Closing a content panel, field notes, or globe view retains the current position. A new document load always starts at the courtyard. Checkpoints from layouts before v6 are invalid for this map; discovery IDs and existing device preferences are retained.

## Shared layout

- `data/world-map.ts`: terrain-independent periodic authoring projection and physical metric. Radius is 36 m; geographic coordinates and geodesic player movement remain unchanged. The seam is in the ocean at inland coordinate 176 m, clear of the extended pier.
- `data/town-layout.ts`: nine closer building shells, courtyard/resort/lookout areas and 20 connected routes. Courtyard 8 m, boardwalk −16 m, pier tip −47 m, resort 115 m and summit 153 m.
- `data/town-surfaces.ts`: a broad, scalloped island, wider beach, tall eastern cliffs, and a 32 m summit with 24 m and 27 m side peaks. The steep rear descent preserves its actual camera sightline across the ocean. The cave floor takes precedence over nearby high areas across its entire width.
- `data/concept-landmarks.ts`: walkable skate heights, explicit twelve-riser stair support, cave floor/clearance and shared render/collision solids. The 12 m lighthouse stands on a 7.8 m-high peninsula at `[36,-27]`, beyond the cave entrance. Its upper trail goes around the outside of the cave and lighthouse, not over the tunnel.
- `scene/TownLandscape.tsx`: complete periodic terrain grid sampling the same height functions as movement, with interior and explicit stair-mesh cutouts.

Walking uses the detailed terrain mesh; distant globe view uses a lower-detail mesh from the same height data. Terrain receives landmark shadows but is excluded from the duplicate full-globe shadow-caster pass. See `docs/qa/globe-concept/verification.md` for the measured performance tradeoff and test results.

The longer pier reduces the pier-to-summit angular separation to about 41.69° across water. The inland authoring separation is 200 m along the opposite route. The rear mountain is not a duplicate or background asset.

Primary paths are approximately 4 m wide; secondary paths are 2.4 m. The pier runs 31 authored metres from the boardwalk to its tip (previously 23), with a 3.8 m neck and an 8 m-wide fishing head. The beach extends to approximately −33 m rather than −25 m. The cave has a 3.8 m floor and 4.35 m roof clearance, enclosed by higher rock walls/crowns. Twelve visible 0.19 m stair risers stop at the skate park's southern rim without filling the bowl. Ramps, bowl and snow trails support walking; skating, skiing and lift mechanics are deferred.

## Content mapping

| Existing destination | New location |
| --- | --- |
| Projects | Portfolio gallery |
| Services | WestCose shop |
| Games | Social club arcade |
| About | WestCose Motel lobby |
| Labs | Graffiti alley room |
| Contact | Courtyard contact station |
| Optional discovery | Hidden beach |

Existing standalone content URLs remain available. Five spatial interiors retain their doorway, furniture and camera collision behavior. Blank art and graffiti walls reserve the artwork positions without creating final graphics.

## Reproducible checks

```sh
npm run typecheck
npm run lint
npm run test:planet
npm test
npm run build
node scripts/audit-town-layout.mjs
node scripts/capture-globe-concept.mjs
node scripts/review-globe-concept.mjs
```

The deterministic checks cover complete-circle and pole transport, the ocean seam, the real pier-to-summit terrain ray, outward terrain triangles, all authored routes in both directions, five interior entrances, pier rail containment, cave collision/ceiling, and walkable skate surfaces. Browser checks exercise actual keyboard/pointer/touch inputs, panels, reload/reset behavior, reduced effects and WebGL recovery.

Performance reports live beside the review. The fresh baseline was captured before the source changes, on this machine, with both endpoint URLs pointed at the development server. Compare development profiles with like-for-like follow-up profiles; the baseline's historically named `productionRoutes` field does **not** constitute a production baseline. RAF cadence is an approximate render-loop metric; touch results are desktop phone emulation, not a physical-device benchmark.

## Approval boundary

Review composition, travel distance, landmark scale, entrances, mountain shape and pier sightline now. Texture production, the specific WestCose art style, painted walls, detailed environment assets, skiing and skating mechanics belong to later approved milestones.
