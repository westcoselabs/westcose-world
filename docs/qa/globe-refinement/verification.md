# Structural refinement verification

Concept geometry only. Texture production, final WestCose artwork, detailed models, skiing/skating/lift mechanics, and physical-phone performance testing remain outside this pass.

## Changes checked

- Broad, continuous mainland with a scalloped coastline instead of the narrow strip; nine closer town shells retain all five entrances and existing content URLs.
- Wider beach (approximately eight additional authored metres seaward) and 31-metre boardwalk-to-pier-tip span, previously 23. The 8-metre fishing head has rails aligned to its actual landward edge; piles extend into the seabed.
- A 12-metre lighthouse on a 7.8-metre raised peninsula beyond the cave, with a graded trail and viewing area.
- Taller cliffs/rock crown enclose a 3.8-metre cave floor with 4.35-metre clearance. Cave floor precedence applies across the complete width, even beside higher terrain/areas.
- Hidden cove opens to the actual ocean; the lighthouse trail stays off its outlet and does not cross the tunnel roof.
- Twelve explicit 0.19-metre stair risers, with matching support, visible tread/riser faces and recessed underlying terrain.
- A 32-metre summit with 24/27-metre side peaks. A more concave central front preserves the summit view from the resort; its rear remains visible across the water from the longer pier.
- Default camera framing accommodates the summit from the pier/resort. Deliberate vertical right-drag disables this assistance; reduced-motion mode avoids the framing interpolation.

## Functional verification

- Typecheck, ESLint and final production build: passed.
- Deterministic movement/geometry: **25/25 passed**. Includes actual terrain-ray clearance from both pier and resort, periodic seam/winding, all routes in both directions, cliff/cove geometry, full cave width, stairs, interiors, and pier containment.
- Full browser suite: **17/17 passed**, covering keyboard, pointer and touch emulation, panels, reset/load behavior, reduced effects, fallback/recovery and actual camera-frustum summit checks.
- Additional targeted camera test: passed after adding vertical right-drag override and stationary-player assertions.
- Static route audit: **20 routes / 5,324 centerline samples / zero collision findings**. All six contextual review positions are dry, exterior and clear.
- Independent actual-controller audit: lighthouse route in both directions, 928 steps each; cave at center and both 1.5-metre side offsets in both directions, 389–395 steps each. No blocked steps or swimming in any traversal.
- Stair visual inspection: distinct treads and risers are visible from below and during keyboard climbing, without floating side gaps.

## Review and runtime measurements

- Final review: **46 real desktop/phone-emulation views**, zero page/render errors, and four passing actual-camera summit-framing checks. All 47 map/gallery images decode; no gallery overflow at 1440 or 390 pixels.
- The entire summit is visible from the pier and through the resort's front valley. The cave portal and the hidden beach's ocean opening are visible. Near lighthouse walking views emphasize its base/cliff; the pier view shows its upper silhouette, while globe views show the entire tower and peninsula.
- Final production route check: Projects, About, Services, Games, Labs, Contact and World all pass without page/render errors. Only World loads the 3D runtime; no development debugger is exposed in production.

Capture, production-route and performance manifests are saved beside this report. Preliminary images in `preview/` intentionally retain issues found during iteration and are not the final review.

Performance comparisons use the earlier concept's development-server measurement on this same computer, not a new physical-device baseline. RAF cadence is a short approximate render-loop measurement, not GPU timing. See `performance.json` for renderer/environment details, source fingerprints and frame-time variation.

| Profile | Earlier entry RAF/s | Refined entry RAF/s | Refined entry p95 | Earlier overview RAF/s | Refined overview RAF/s |
| --- | ---: | ---: | ---: | ---: | ---: |
| Desktop | 49.5 | 60.0 | 17.0 ms | 38.8 | 60.0 |
| Phone emulation | 58.3 | 60.0 | 16.9 ms | 60.0 | 60.0 |

These were isolated three-second samples with fresh contexts, matching browser/CPU/renderer/viewports and no world-source changes during measurement. No page/render errors were observed. The added geometry increases desktop entry triangles from 437,298 to 486,686 (about 11%); this run did not show a frame-rate regression, but short timings vary and do not guarantee 60 fps on physical phones. The performance report's historically named `productionRoutes` field targets the development server for like-for-like comparison; `production-check.json` separately verifies the final actual production build.
