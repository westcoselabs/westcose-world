# Dead Coast validation

Validated on 5 September 2026. This report covers the expanded spherical town: 26 primary buildings, 12 secondary structures, 18 authored routes, five walk-in rooms and seven discoverable places.

## Functional checks

- **16 deterministic checks passed** with `npm run test:planet`. They cover great-circle travel, the longitude seam, both poles, terrain continuity, twelve overlook stairs, six cove treads, solid walls and sliding, camera obstruction, ocean support, invalid checkpoints, every route in both directions, all five doorways and floors, dry boardwalk access, pier side rails, the loop around the arcade, and valid land/water/interior session restoration.
- **15 browser tests passed** with `npm test`, using actual keyboard, mouse and touch input. Coverage includes a complete spherical circuit, pole traversal, stairs and walls, swimming, camera shortening and overview return, gesture release, nearby notes, discovery, canonical-page navigation and return, pause/reset, reduced effects, invalid storage, the unconnected FightClub cabinet, entry and exit through every room, dry boardwalk walking, unavailable-WebGL fallback, and a phone viewport. No uncaught page errors were recorded.
- After the final pavement render update, **two focused browser checks passed again**: canonical-page navigation and return, and dry boardwalk walking. The full browser run preceded this final visual change; its shared collision and route data were unchanged. Production isolation was repeated against the final production build.
- The [layout preflight](layout-preflight.json) sampled **4,127 route-center points** against the actual spherical support and capsule collision modules, including walls, furniture and pier rails. It found **zero collisions**. The movement tests additionally walk every route in both directions; static samples alone do not establish that every pavement edge is passable.

The five rooms tested are the studio, about office, workshop, lab and arcade. Door tests cross the actual opening, identify the active room, verify its tangent floor and walk out again. Pier tests distinguish dry decking from the water beneath it, stop the visitor at both side rails, leave the aft edge open for swimming, and prove that both passages beside the arcade remain traversable.

## Production isolation

The [production check](production-check.json) inspects `/projects`, `/about`, `/services`, `/games`, `/labs` and `/world` in separate browser contexts. The five HTML destinations load no Three.js renderer chunk and create no canvas. `/world` loads one canvas and its isolated renderer chunk. Production exposes no development control hook. The check also records page errors, external requests and transfer sizes.

## Performance measurement

The [final uncontended run](performance.json) began at **19:56:28 UTC on 5 September 2026**. All world source fingerprints matched before and after the run, and no page errors or external resource requests were recorded. The earlier [contended run](performance-contended.json) was excluded because another build used the CPU during its sampling window.

Hardware/software: Windows 11 build 26200, Intel Core i7-13620H, Intel UHD Graphics through ANGLE/D3D11, Chrome 152.0.7977.77. These match the baseline. The desktop viewport is 1440 × 900; both profiles use device-pixel ratio 1.

| Profile / view | Baseline RAF/s | Final RAF/s | Final p95 interval | Draw calls | Submitted triangles |
|---|---:|---:|---:|---:|---:|
| Desktop entry | 54.3 | 59.3 | 24.2 ms | 65 | 258,748 |
| Desktop globe | 59.3 | 63.0 | 18.4 ms | 66 | 258,944 |
| Phone emulation entry | 96.1 | 85.9 | 18.3 ms | 61 | 257,428 |
| Phone emulation globe | 99.9 | 89.4 | 18.2 ms | 66 | 258,944 |

Desktop entry cadence was 9.2% higher in this sample; the phone-emulation entry cadence was 10.5% lower. Their p95 intervals changed by only +0.1 ms from the baseline. This short sample does not establish a sustained performance improvement. The desktop entry's p99 interval was 30.4 ms, with one interval above 33.4 ms and a maximum of 36.4 ms. The phone entry had no intervals above 33.4 ms. Entry draw calls rose from 57 to 65 on desktop while submitted triangles fell from 264,058 to 258,748.

Chrome's used JavaScript heap at the entry snapshot was **60.15 MB on desktop** and **49.39 MB for phone emulation**; globe snapshots were 55.65 MB and 50.90 MB. The renderer reported **40 geometries and four textures** in both profiles. Heap values fluctuate with garbage collection and are snapshots, not a memory-leak or peak-memory test.

### Production loading

| Route | Local readiness | Encoded body bytes | Transfer bytes | Decoded body bytes |
|---|---:|---:|---:|---:|
| `/projects` | 0.94 s | 258,770 | 266,570 | 643,417 |
| `/about` | 0.91 s | 258,557 | 266,057 | 642,163 |
| `/services` | 0.93 s | 258,528 | 266,028 | 642,032 |
| `/games` | 0.99 s | 258,570 | 266,070 | 642,222 |
| `/labs` | 0.92 s | 258,526 | 266,026 | 642,005 |
| `/world` | 1.70 s | 518,957 | 524,357 | 1,590,331 |

The world transferred **524,357 bytes (0.524 MB)**, up **11,729 bytes / 2.29%** from the baseline's 512,628 transfer bytes. Encoded body size increased from 507,228 to 518,957 bytes. Local readiness was 1.70 s versus 1.54 s before expansion. The production world used 54.45 MB of JavaScript heap at the readiness snapshot; the HTML pages used approximately 3.92 MB each. Production loaded nine script resources for the world and seven per HTML page.

### Proposed starting budgets

The [architecture's original targets](../../WESTCOSE_WORLD_ARCHITECTURE_V1.md#11-initial-performance-and-accessibility-gates) remain useful reference points, rather than device-independent guarantees:

| Target | Observed result |
|---|---|
| No world payload on unrelated routes | Passed for all five tested HTML destinations; no Three.js renderer chunk or canvas. |
| About 8 MB critical world transfer | 0.524 MB total measured transfer. |
| Below about 150 typical draws | 61–66 in the sampled views. |
| Below about 200,000 visible triangles | The renderer reports roughly 259,000 submitted triangles including shadow passes. This is not an isolated visible-triangle count, so the original target is not established by this measurement. |
| Stable 60 fps desktop movement | Not established. The idle entry sample averaged 59.3 RAF/s with a 24.2 ms p95 interval; it is neither a movement benchmark nor a sustained-60 test. |
| Stable 30 fps on a real midrange phone | Not measured; the phone profile is desktop browser emulation. |

The [baseline](baseline-performance.json) and final run use the same local desktop, warm servers, fresh browser contexts, Chrome headless and no CPU or network throttling. Each entry and globe view is sampled for eight seconds on the development build; production resource and readiness measurements use the production build. `requestAnimationFrame` callback cadence is a render-loop proxy, not measured GPU frame timing or a guaranteed frame rate. The phone profile emulates a 390 × 844 touch viewport on the desktop hardware; it is not a physical-phone benchmark. Chrome's JavaScript heap metric excludes GPU memory. Renderer counts include shadow passes.

The production readiness measurement runs from navigation until the network-idle/entry-ready checks finish; the network-idle wait makes it a conservative local readiness measurement. Encoded body size and transfer size are reported separately. Measurements from local warm servers do not predict first visits over a mobile network.

## Evidence and reproduction

- [Town views](views/) and [capture state](capture-state.json) document the final visual walkthrough.
- `node scripts/audit-town-layout.mjs` regenerates the static route audit.
- `npm run test:planet` runs the deterministic geometry, movement and session suite.
- `npm test` runs the browser suite against the local development server on port 3000.
- `node scripts/verify-production.mjs` checks the production server on port 3001.
- `node scripts/measure-world.mjs` records frame cadence from port 3000 and production resource/readiness data from port 3001. Keep other builds, captures and browser tests stopped during measurement. The script fingerprints all world source modules before and after the run so source changes can invalidate a comparison.

These checks validate the authored routes and tested inputs. They do not claim exhaustive coverage of every terrain edge, browser/GPU combination or physical mobile device. FightClub remains explicitly unconnected until an actual game build or URL is supplied.
