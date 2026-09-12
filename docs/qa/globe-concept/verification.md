# Concept verification

The structural concept is ready for placement review; it is not a final-art or final-performance release.

This report describes the first pass. The current structural refinement is in `../globe-refinement/`. First-pass captures and performance measurements remain here; the generated `layout-preflight.json` was refreshed during refinement and is not an immutable first-pass audit.

## Functional checks

- TypeScript and production build: passed.
- ESLint: passed without warnings.
- Deterministic movement / geometry: 19 tests passed.
- Full browser suite: 16 tests passed, including keyboard, mouse, touch emulation, reduced effects, interiors, fresh-load/reset behavior and HTML fallback.
- After the rendering-only performance changes, the two targeted browser regressions for camera/globe return and pause/effects/reset also passed.
- Route audit: 20 routes, 4,821 samples, no obstructions. All three review approach points are dry, outside interiors and clear of solid collision.
- Visual review: 38 desktop/phone captures, including four globe viewpoints per profile; no browser/rendering errors. The lighthouse close-up is intentionally supplemented by approach and globe views.
- Production route check: Projects, About, Services, Games, Labs, Contact and World load without script or rendering errors. Only World loads the Three.js runtime; development teleport helpers are absent in production.

The pier-to-summit ray is checked against both the ocean sphere and the mountain terrain. Rendered terrain triangles are separately checked for outward winding and matching periodic seam vertices. Cave walls and roof share their visible matrices with camera/player collision; the bowl and quarter pipes use actual ground support rather than visual-only meshes.

## Performance comparison

See `baseline-performance.json` and `performance.json` for raw timing, environment and source fingerprints. Both measure development-server profiles on the same computer with fresh contexts and three-second samples. `production-check.json` separately verifies the actual production build. The legacy field named `productionRoutes` in the performance reports targets development and is labeled accordingly.

| Profile | Baseline entry RAF/s | Final entry RAF/s | Baseline entry p95 | Final entry p95 |
| --- | ---: | ---: | ---: | ---: |
| Desktop | 53.6 | 49.5 | 24.5 ms | 49.9 ms |
| Phone emulation | 91.3 | 58.3 | 18.2 ms | 17.2 ms |

Final overview measurements were 38.8 RAF/s desktop and 60.0 RAF/s phone emulation. These short RAF samples varied between runs (an intermediate desktop walking run reached 60 RAF/s); they are not GPU timings or physical-phone measurements. Timing parity with the original map is **not** claimed. Desktop overview/frame-time consistency remains an optimization target for the next engineering pass.

The first new-layout measurement exposed a costly full-terrain shadow pass (`performance-pre-optimization.json`). The final terrain receives building/landmark shadows without redrawing the whole globe as a shadow caster, and distant globe view uses a lower-detail mesh sampled from the same terrain. Walking retains the detailed mesh and unchanged collision. Desktop entry triangles fell from 610,856 in the baseline to 437,298; final overview draws 248,610 triangles. The source fingerprints were unchanged during the final measurement, and it reported no rendering errors.

## Deferred by design

Final textures, personal art style, artwork, detailed models, skiing/skating/lift mechanics, physical-device performance testing and production polish are outside this structural approval milestone.
