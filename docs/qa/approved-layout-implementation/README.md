# Approved layouts — live implementation review

Implemented the approved mountain revision 3 and approved single-cove geography. The immutable design drawings remain under `docs/design/`; this folder records the resulting live world.

## Scope

- Radius-36 globe and existing projection retained. The same summit at [0,153] is now 40m above the base sphere; runtime safety/framing envelope is 42m.
- Exact approved curved runs: central 1 (138.4m, 6.5m wide), eastern 2 (134.9m, 8m wide), western 3 (140.1m, 7m wide). Physical widths, separated start gates and finish lanes, extended snow bowl.
- Lodge [-3,55] and ticket booth [5.07216494845,55] share the 2.8m base terrace below F. Building gap is 3m. New walking links connect the forest, forecourt, finish and summit. Approach endpoints stop 0.55 chart metres before closed building faces for capsule clearance.
- Exact approved single-cove coast, sand crescent and cliff rim replace the old dividing spur. The lighthouse model and [36,-32] foundation remain unchanged. A real 3.4m-wide, 4m-clear underpass passes below it and exits onto the extended hidden beach.
- Fixed a portal-layer overlap which toggled repeatedly at the cave exit. Entering/exiting now produces exactly one support-layer transition in each direction.
- Bumped layout version to 7; fresh loads still start in the courtyard. Preferences and discovery content remain available.

## Preservation

`protected-baseline.json` was sampled before this implementation. `preservation.json` verifies seven unchanged town buildings, thirteen unchanged routes and 1,023 terrain samples. The sole permitted difference is the 2.5cm path skin at the final forest-route junction; protected terrain elsewhere is identical. Downtown, courtyard, boardwalk, pier and skate layout are not redesigned.

The code graph traced the terrain/route/render/collision consumers before integration. The typed runtime model does not import drawing scripts. Spatial lookup avoids scanning every sampled snow-run segment during each terrain query.

## Validation

- `npm run typecheck`, `npm run lint`, `npm run build`.
- `npm run test:planet`: 27 analytic/rendered-geometry and real movement checks, including all mountain routes and connectors in both directions, same-mountain pier sightline, both terrain LODs, cave support and camera collision, interiors, stairs and pier.
- `node scripts/check-mountain.mjs`: 7 checks for exact approval parity, monotone descents, physical run width, separation, foundations and bounded overlay.
- `node scripts/check-single-cove-layout.mjs`: 725 former-divider points underwater; entire 30.28m crescent walked both ways in 684 controller steps per direction; one portal transition each way.
- `node scripts/check-approved-preservation.mjs`: unchanged protected layout.
- Full Playwright browser suite: **18/18 passed** against the final source (output `.next/approved-final-tests`). This includes native underpass traversal, seam/pole motion, camera controls, all existing interiors, fresh-load/return behavior, reduced effects and touch movement.
- Final capture sources match: 27 mountain views + 20 cove views, no page/WebGL exceptions. The gallery verifies all 49 images (including two maps) at 390px and 1100px with no broken images or overflow. One generic resource 404 remains recorded in the mountain console manifest; no runtime render failure accompanies it.
- Performance is recorded in `performance.json`: approximately 60 RAF frames/second in desktop and phone-emulated walking/overview, with 17ms walking p95 and no rendering errors. The measurement's Chrome version, renderer, CPU and viewports match the September 12 historical globe-refinement baseline. This is not a fresh pre-edit measurement, so treat the comparison as indicative rather than a controlled causal test. Desktop uses 74 draw calls / 462,904 triangles (baseline 69 / 486,686); phone uses 70 / 458,255 (baseline 67 / 485,194). Phone emulation is not a physical-device benchmark.

The 252- and 126-column terrain grids sample the crest at 39.8221m because the exact 40m summit falls between rows. Both agree with the continuous support field at their sample points; there is no 39m height clamp or missing terrain cap.

## Review caveats — actual views, not promises from a flat map

The low F/base resort lies around the globe from the summit. The solid sphere correctly hides the summit from that base. The pier sees the same real rear mountain, but the approved taller/broader massif dominates the normal outward camera and leaves almost no visible water band. Achieving a distant-across-water composition would need a separate camera/geography decision; it has not been silently faked with a second mountain or a moved pier.

The concept globe view has visibly stepped route margins from the sampled terrain/height transitions. These captures deliberately show the current blockout. No texture, detailed rock, vegetation-art or snowboard gameplay pass was performed. Ticket activation, summit game transfer, snowboarding physics, timing and scoring remain future work.

## Artifacts

`index.html` combines annotated live-support maps with actual desktop and phone game captures. Individual images and source/error manifests are in `mountain/` and `cove/`. The maps are unwrapped authoring charts: height colors are bands, and chart distances are not physical surface distances.
