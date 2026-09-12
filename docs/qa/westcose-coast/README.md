# WestCose World coastal validation

Current expansion, 7 September 2026. The visual baseline is the [previous sunset pass](../dead-coast-sunset/performance.json); the final optimization compares against the [same coastal expansion before regional culling](performance-before-culling.json). The app's visible name is WestCose World; earlier named folders retain their historical evidence.

## Changes

- The original 20 town trees remain, joined by 199 accepted oaks/cypresses across 20 authored regions. New planting includes 708 grass clumps, 135 shrubs, 53 rocky outcrops, three natural-ground trails and three lookouts. Six middle-slope groves close the larger gaps between the initial coastal regions.
- The Arcade, surf shack, radio hut, beach hut and bait kiosk sit on dry ground behind a continuous promenade and broader beach. Their full rotated footprints have between 6.63 and 11.64 metres of minimum shoreline setback. All 38 building footprints pass the dry-ground audit.
- The dedicated timber pier has a 3.8 m physical-width walkway, an 8 m fishing head, 105 transverse boards, 18 piles, under-deck beams and braces, guarded sides, benches, lamps, fishing hardware and signs. The approach is open to the promenade. Shared deck and guard data drive visible geometry, walking support and collision.
- Building foundations close the gap beneath tangent slabs on the curved terrain. The 21 town routes include a promenade/beach loop and a corrected shortcut around the relocated Arcade. The five rooms and content registry remain in use.
- The low fixed sunset remains, with stronger neutral/cool fill for readable shaded hemispheres. Muted sage and gold soil replaces the sharper town gravel treatment under the groves. The only sun shadow map remains 2048 pixels; no dependencies or downloaded models/textures were added.

## Static and visual evidence

[Static validation](STATIC_VALIDATION.md) records the building and planting checks. [Route preflight](layout-preflight.json) found no obstructions in 4,957 samples of the actual capsule collision system. The final [hinterland audit](hinterland-static.json) checks radial grounding, continuous trail clearance, dry land, building clearance, geodesic spacing and finite geometry. Minimum new-trunk spacing is 3.304 m. Canopy overlap is intentional; the small decorative plants do not add mesh colliders.

The full [browser validation](browser-validation.md) passed all 15 cases and 16 deterministic planet checks, including real input along the whole pier and back to land, all five rooms, poles, globe return and touch controls. Four focused browser checks passed again after the final rendering optimization, covering camera obstruction, input cleanup, all interiors and touch controls. The final 20 [screenshots](views/) include five globe angles, both planted hemispheres, the raised pier from above/on deck/from the beach, promenade, courtyard, Studio Row, the relocated Arcade interior and portrait touch layouts. The Arcade capture uses real forward input through its doorway. Entry-screen captures verify the WestCose World title on desktop and portrait screens; the beach capture also checks the relocated radio discovery. The `quick` and `light-check` folders are preliminary iterations, not the final views.

Visual review confirmed a clear dry beach strip between shops and water, a supported pier silhouette, connected canopy masses, readable shaded ground and retained sunset shadows. Open trail corridors and selected meadow gaps remain between groves. The terrain and vegetation are stylized browser geometry; no photorealism or physical-phone performance is claimed.

The [private screenshot gallery](https://westcose-world-screenshots.westcose-co.chatgpt.site) contains these 20 actual images. Gallery version 5 was published successfully from source commit `e672cb4a70ebd364338c3192fde1fc070d585b4c`; its audience remains owner-only. The playable application remains local.

## Geometry accounting

The new hinterland contains 162,186 authored physical triangles. The first implementation used six broad tree batches plus four ground/detail batches; these submitted too much hidden geometry. The final implementation instances two shared archetypes in 29 tighter region/species batches, plus three ground batches and one lookout batch. Frustum rejection and conservative whole-bound planet occlusion reduce actual submissions. Geometry and all 199 anchors are identical. The pier adds 21,472 triangles. Foundation skirts add 3,660 triangles to an existing batch without extra colliders/draws. Old pier geometry was removed. Renderer submission totals also include shadow passes and should not be confused with visible physical geometry.

## Final build and measurements

Full ESLint, TypeScript checking and the final production build passed. The final [production isolation check](production-check.json) passed on six routes: the five HTML destinations load seven scripts and no canvas or Three.js chunk; `/world` loads nine scripts and one canvas after entry. There were no external requests, page errors, shader errors or exposed development hooks.

The [final performance sample](performance.json) used Chrome 152 on this Windows computer's Intel UHD graphics, the same renderer, CPU and viewports as the before-culling sample. Each view sampled eight seconds with no concurrent browser work or builds. World source fingerprints remained unchanged and there were no rendering errors.

| View | Approximate RAF/s | p95 frame interval | Draw submissions | Submitted triangles |
| --- | ---: | ---: | ---: | ---: |
| Desktop walking | 59.8 | 17.3 ms | 78 | 610,856 |
| Desktop globe | 60.0 | 17.0 ms | 123 | 806,850 |
| Phone-emulated walking | 60.0 | 16.9 ms | 72 | 586,992 |
| Phone-emulated globe | 59.3 | 16.9 ms | 125 | 824,426 |

Compared with the same planting before culling, desktop walking improved from 53.9 to 59.8 RAF/s and p95 fell from 33.5 to 17.3 ms. Walking submits 18.2% fewer triangles; the phone layout submits 18.8% fewer. Tighter batches increase globe draw submissions (93 to 123 on desktop) while reducing triangles from 885,018 to 806,850; its sampled cadence improved from 56.3 to 60.0 RAF/s. Both versions contain the same 199 new trees. These are short local render-loop samples, not sustained GPU timing or physical-phone benchmarks.

The renderer reports 54 geometries and seven textures. Production world transfer was 546,302 bytes (540,902 encoded-body bytes; 1,652,962 decoded). Its warm-local ready sample was 4.75 seconds, versus 1.84 seconds in the earlier single sample; local readiness varied and is not a controlled network benchmark. JavaScript heap snapshots were 75.4 MB for desktop walking, 92.9 MB for phone-emulated walking and 183.9 MB at production readiness; these transient Chrome snapshots exclude GPU memory. No downloaded models, bitmap textures or dependencies were added.

## Reproduction

Run `npm run lint`, `npm run typecheck`, `npm run test:planet` and `npm test`. Against the development server, run `node scripts/capture-coast.mjs`. Set `WORLD_LAYOUT_OUTPUT=docs/qa/westcose-coast/layout-preflight.json` for `node scripts/audit-town-layout.mjs`, and `WORLD_COAST_AUDIT_OUTPUT=docs/qa/westcose-coast/coastal-after.json` for `node scripts/audit-coastal-layout.mjs`; `node scripts/audit-hinterland.mjs` writes to this directory directly. Set variables using your shell's syntax.

For clean performance comparison, run the production server on port 3001, then `node scripts/measure-world.mjs` with `WORLD_MEASURE_OUTPUT=docs/qa/westcose-coast/performance.json` and `WORLD_BASELINE_PATH=docs/qa/westcose-coast/performance-before-culling.json`. Set `WORLD_PRODUCTION_CHECK_OUTPUT=docs/qa/westcose-coast/production-check.json` for `node scripts/verify-production.mjs`. Keep source frozen and run without concurrent browser work or builds. The script records source hashes and rejects rendering errors or mid-run source edits.
