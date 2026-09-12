# Dead Coast sunset validation

Validated against the final sunset source and material revision v5 on 5 September 2026 (measurement timestamp: 6 September, 00:06:59 UTC). The comparison baseline is the [previous atmosphere pass](../dead-coast-atmosphere/performance.json).

The lighting now has a low amber sun, darker cool fill, peach horizon haze and real warm lamp pools. Three reusable, unshadowed point lights select nearby exterior lamps or the current room's lamps. Exterior intensity is 11 cd and interior intensity 14 cd. The single 2048-pixel sun shadow map remains; no additional shadow pass or postprocessing dependency was added. ACES exposure is 0.84. Reduced effects removes realtime shadows and haze while keeping the scene readable.

## Checks and visual evidence

- **16 deterministic checks passed**, including sphere/poles, camera collision, all authored routes, five doorways, dry pier access, rails and session validation.
- **Four focused browser tests passed in 39.7 seconds**: camera obstruction/globe return, pause/reset/reduced effects, keyboard entry and exit through all five rooms, and phone touch movement.
- **Nine lighting checkpoints passed** with finite state, active rendering and zero page or THREE/WebGL/shader console errors. See [saved states](lighting-check.json) and [images](lighting/).
- **Production isolation passed on six routes**. `/projects`, `/about`, `/services`, `/games` and `/labs` each loaded seven scripts, no renderer chunk and no canvas. `/world` loaded nine scripts, its isolated renderer chunk and one canvas. There were no external resource requests, rendering errors or exposed production debug hooks. See [production results](production-check.json).
- The integration run passed the full lint and production build. The entire browser suite was not rerun; the four selected tests cover the affected rendering and interaction paths.

Visual inspection of the nine lighting images and five final room images confirmed readable room floors, furniture and signs, distinct water at the south pole, and intact desktop/phone globe framing. Far-side terrain is intentionally very dark but retains visible surface detail and a clear horizon. The north pole retains directional texture grain from the earlier material pass. Reduced effects visibly removes the sun shadows.

The final authored walkthrough is the **13 screenshots in [views](views/)**, refreshed after material revision v5. The [quick](quick/) images are preliminary iterations, not final evidence.

## Performance and loading

The [clean measurement](performance.json) ran without concurrent builds, captures or browser tests. World source hashes matched before and after; all page and rendering-error arrays were empty. Hardware matched the baseline: Windows build 26200, Intel Core i7-13620H, Intel UHD Graphics through ANGLE/D3D11, Chrome 152.0.7977.77. Desktop used 1440 × 900; phone emulation used 390 × 844 with touch. Both used DPR 1.

| Profile / view | Previous RAF/s | Sunset RAF/s | Sunset p95 interval | Draw calls | Submitted triangles |
|---|---:|---:|---:|---:|---:|
| Desktop entry | 64.2 | 61.7 | 18.4 ms | 69 | 539,848 |
| Desktop globe | 74.6 | 70.6 | 18.4 ms | 72 | 541,516 |
| Phone emulation entry | 112.9 | 115.0 | 12.3 ms | 65 | 536,852 |
| Phone emulation globe | 117.5 | 120.7 | 12.3 ms | 72 | 541,516 |

Desktop entry cadence was **3.9% lower** and globe cadence **5.4% lower** in this sample. Entry p95 was essentially unchanged; neither profile had an entry interval above 33.4 ms. Desktop entry p99 was 18.7 ms and maximum 24.4 ms. Entry submissions increased by two draw calls and 3,220 triangles (0.6%). The renderer reported 45 geometries and six textures.

Production `/world` readiness was **1.28 seconds**, versus 1.26 previously. It transferred **538,240 bytes**, an increase of **3,652 bytes / 0.68%**; encoded bodies totaled 532,840 bytes and decoded bodies 1,629,472 bytes. HTML routes remained approximately 266 KB transferred and 0.63–0.66 seconds to readiness. Development readiness was 4.60 seconds desktop and 2.15 seconds phone emulation.

Chrome's used JavaScript heap snapshots were **84.66 MB** at desktop entry, **72.00 MB** at phone entry and **189.71 MB** at production readiness (previous readiness: 183.65 MB). These snapshots vary with construction timing and garbage collection and exclude GPU memory. The [previous targeted memory diagnostic](../dead-coast-atmosphere/memory-check.json) established that much of the earlier readiness spike was transient; it was not repeated for this pass, so no new retained-memory or leak claim is made.

Each stationary view was sampled for eight seconds on the development build. RAF callback cadence is a render-loop proxy, not GPU timing or a sustained movement benchmark. Phone emulation uses this desktop's CPU/GPU, not a physical phone. Production loading used fresh contexts, warm local servers and no throttling; readiness includes the network-idle wait. These short samples establish neither a sustained improvement nor stable 60 fps desktop / 30 fps physical-phone movement.

Measured transfer remains below the proposed 8 MB budget and draw calls below 150. The proposed 200,000 visible-triangle target is **not established**: totals above 536,000 include shadow submissions and are not an isolated visible-triangle measurement.

## Reproduction

Run `npm run test:planet`, then `npm test -- --grep "camera shortens|pause clears|each authored room|one-finger"`. Set the following output variables before running each script:

- `WORLD_LIGHTING_OUTPUT=docs/qa/dead-coast-sunset`: `node scripts/verify-atmosphere.mjs`.
- `WORLD_PRODUCTION_CHECK_OUTPUT=docs/qa/dead-coast-sunset/production-check.json`: `node scripts/verify-production.mjs`.
- `WORLD_MEASURE_OUTPUT=docs/qa/dead-coast-sunset/performance.json` and `WORLD_BASELINE_PATH=docs/qa/dead-coast-atmosphere/performance.json`: `node scripts/measure-world.mjs`, alone.

The scripts reject page and rendering-console errors; measurement also rejects source changes during the run. Missing-favicon noise is excluded from rendering-error classification.
