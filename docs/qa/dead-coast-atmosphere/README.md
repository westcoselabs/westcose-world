# Dead Coast atmosphere validation

Validated on 5 September 2026 against the completed atmosphere pass. The comparison baseline is the [previous clean town measurement](../dead-coast/performance.json), before the richer materials, building details, foliage and coastal lighting.

## Rendering changes

The scene now uses a warm western sun with cool fill, a blue-grey sky gradient, subtle distance haze and a small generated environment for roughness-dependent reflections. A single 2048-pixel PCF shadow map covers 48 metres around the visitor and expands to 100 metres in globe view. Its position snaps to shadow texels to reduce shimmer. Renderer output is explicitly sRGB with ACES filmic tone mapping and exposure 1.02.

The 128-pixel procedural environment is baked once per mount; its construction resources are disposed immediately, and its retained texture is disposed on unmount. No downloaded HDR, postprocessing dependency or additional realtime shadow-casting light was introduced. Reduced effects disables realtime shadows and haze, while retaining readable lighting. The material and foliage pass adds surface variation, damp courtyard patches, architectural trim, trees, smaller plants and ivy.

## Functional and visual checks

- **Four focused browser tests passed** in 38.7 seconds: camera obstruction/globe return, pause/reset/reduced effects, real keyboard entry and exit through all five rooms, and phone touch movement. The shared browser error collector now also rejects THREE/WebGL/shader console errors.
- **Nine lighting checkpoints passed**, with finite camera/visitor state, active rendering and no page or rendering-console errors. [Saved states](lighting-check.json) and [lighting images](lighting/) cover entry, the far-side circuit fixture, both poles, reduced effects, desktop globe and phone entry/globe.
- Visual inspection of those nine images and the five final room images confirmed readable shaded rooms, far-side terrain and water, a cool visible sky, and intact globe/phone framing. Reduced effects visibly removes realtime shadows. The northern-pole substrate still shows directional texture grain; this is a remaining material polish item outside the authored town.
- The parent integration run also passed the production build, full lint and **16 deterministic movement/collision/session checks**. This pass did not rerun the entire 15-test browser suite: the focused cases cover the rendering changes, and route/controller behavior was unchanged.

The final authored walkthrough is the **13 images in [views](views/)**. Loose `entry.jpg`, `courtyard.jpg`, `alley.jpg`, `stairs.jpg` and similar files at this directory's root are preliminary iterations and should not be presented as final evidence. `quick-capture-state.json` describes a quick capture only; the separately saved `lighting-check.json` is the complete nine-view verification record.

## Production isolation

The [production check](production-check.json) passed for `/projects`, `/about`, `/services`, `/games`, `/labs` and `/world`. Each HTML destination loaded seven script resources, no Three.js renderer chunk and no canvas. `/world` loaded nine scripts, its isolated renderer chunk and one canvas. No production debug hook, page errors, rendering-console errors or external resource requests were recorded.

## Performance

The [uncontended measurement](performance.json) started at **21:14:38 UTC**. All world source hashes matched before and after the run, and all page/rendering-error arrays were empty. No build, screenshot run or browser test overlapped the sample.

Hardware and browser matched the baseline: Windows build 26200, Intel Core i7-13620H, Intel UHD Graphics through ANGLE/D3D11 and Chrome 152.0.7977.77. The desktop viewport was 1440 × 900; the phone emulation was 390 × 844 with touch enabled. Both used device-pixel ratio 1.

| Profile / view | Baseline RAF/s | Current RAF/s | Current p95 interval | Draw calls | Submitted triangles |
|---|---:|---:|---:|---:|---:|
| Desktop entry | 59.3 | 64.2 | 18.5 ms | 67 | 536,628 |
| Desktop globe | 63.0 | 74.6 | 18.3 ms | 70 | 538,296 |
| Phone emulation entry | 85.9 | 112.9 | 12.3 ms | 63 | 533,632 |
| Phone emulation globe | 89.4 | 117.5 | 12.3 ms | 70 | 538,296 |

No entry interval exceeded 33.4 ms in either profile. Desktop entry's p99 interval was 24.3 ms and its maximum was 24.4 ms. The renderer reported **43 geometries and six textures**, compared with 40 and four before the pass.

Cadence was higher in this short sample, but this does **not** establish a sustained performance improvement. Submitted desktop entry triangles increased **107.4%**, from 258,748 to 536,628, while draw calls increased from 65 to 67. The additional architecture and foliage represent real geometry work, including their shadow passes. The increased geometry budget should remain visible in future device testing.

Each view was sampled for eight seconds on the development build, using `requestAnimationFrame` intervals. These callbacks are an approximate render-loop cadence, not measured GPU frame timing. The samples are stationary views, not a sustained movement benchmark. Phone emulation runs on the desktop CPU/GPU and does not establish physical-phone performance.

### Production loading

Production metrics use fresh browser contexts against the local production build and warm server. Readiness includes the network-idle wait and the enabled entry button, so it is a conservative local measurement rather than a mobile-network first-visit prediction.

| Route | Local readiness | Encoded body bytes | Transfer bytes | Decoded body bytes |
|---|---:|---:|---:|---:|
| `/projects` | 0.66 s | 258,768 | 266,568 | 643,417 |
| `/about` | 0.64 s | 258,554 | 266,054 | 642,163 |
| `/services` | 0.64 s | 258,526 | 266,026 | 642,032 |
| `/games` | 0.65 s | 258,568 | 266,068 | 642,222 |
| `/labs` | 0.65 s | 258,524 | 266,024 | 642,005 |
| `/world` | 1.26 s | 529,188 | 534,588 | 1,618,884 |

World transfer increased by **10,231 bytes / 1.95%**, from 524,357 to 534,588 bytes. HTML-route transfer remained effectively unchanged. Development entry readiness was 3.89 s on desktop and 2.09 s for phone emulation; these are separate from the production readiness figures.

### Memory follow-up

Chrome's `performance.memory` snapshots in the benchmark reported **84.02 MB** used JavaScript heap at desktop entry, **92.45 MB** at phone entry and **183.65 MB** at production readiness. These snapshots include construction timing and garbage-collection variability. The production increase warranted a separate [memory check](memory-check.json), rather than interpreting one readiness snapshot as retained memory.

That check used a fresh production context, Chrome DevTools Protocol `Runtime.getHeapUsage`, and real client-side links to leave and return to the world. CDP reports JavaScript heap and backing storage separately:

| Checkpoint | Used JS heap | Backing storage | Canvas count |
|---|---:|---:|---:|
| Initial ready | 138.11 MB | 43.15 MB | 1 |
| After eight seconds, natural collection only | 33.31 MB | 43.15 MB | 1 |
| World after explicit collection | 9.41 MB | 43.11 MB | 1 |
| First client-side route exit, collected | 8.88 MB | 29.21 MB | 0 |
| Return to world, collected | 10.82 MB | 43.12 MB | 1 |
| Second client-side route exit, collected | 9.74 MB | 29.21 MB | 0 |

The large readiness heap was largely transient construction garbage. Backing storage returned to approximately 29.21 MB on both route exits, with no accumulating buffer growth in these two cycles. Explicit garbage collection is a diagnostic action, not normal visitor behavior. This short check is not a long-duration leak test, and neither the CDP nor `performance.memory` figures measure GPU memory. The two APIs' figures should not be treated as interchangeable totals.

## Budget interpretation

- No world renderer payload on the five tested unrelated HTML routes: **passed**.
- Proposed ~8 MB critical transfer target: **0.535 MB measured**.
- Proposed ~150 typical draw-call target: **63–70 measured**.
- Proposed ~200,000 visible-triangle target: **not established**; reported totals exceed 530,000 and include shadow submissions rather than an isolated visible-triangle count.
- Stable 60 fps desktop movement and stable 30 fps on a real midrange phone: **not established** by these stationary desktop/emulated samples.

## Reproduction

- Focused controls: `npm test -- --grep "camera shortens|pause clears|each authored room|one-finger"`.
- Lighting views: `node scripts/verify-atmosphere.mjs`.
- Production isolation: set `WORLD_PRODUCTION_CHECK_OUTPUT=docs/qa/dead-coast-atmosphere/production-check.json`, then run `node scripts/verify-production.mjs`.
- Performance: set `WORLD_MEASURE_OUTPUT=docs/qa/dead-coast-atmosphere/performance.json` and `WORLD_BASELINE_PATH=docs/qa/dead-coast/performance.json`, then run `node scripts/measure-world.mjs` alone.
- Targeted memory diagnostic: `node scripts/check-world-memory.mjs`.

The measurement and verification scripts fail on shader/WebGL console errors as well as uncaught page errors. The measurement also rejects world source changes during a run. Unrelated missing-favicon console noise is excluded from the rendering-error classification.
