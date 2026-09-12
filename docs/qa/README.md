# First playable validation — September 5, 2026

> Historical flat-map build. The current spherical version and its new checks are documented in [Planet V2 validation](planet/README.md). Screenshots and metrics below are retained for comparison and do not describe the current runtime.

## Outcome

The local first playable builds and passes all 14 browser tests. Original design documents remain unchanged. No deployment or Git operations were performed.

| Check | Result |
| --- | --- |
| `npm run lint` | Passed, no errors or warnings |
| `npm run typecheck` | Passed |
| `npm test` | 14 passed in 1.3 minutes; see `browser-checks.md` |
| `npm run build` | Passed; 10 application routes listed, statically prerendered |
| `node scripts/verify-production.mjs` | Passed against `npm start -- --port 3001` |
| `node scripts/capture-world.mjs` | Captured and visually inspected 11 actual browser views |

The production audit uses fresh Chrome contexts, reads actual requested JavaScript, measures Resource Timing entries, checks page errors and verifies that the development debug interface is absent. It is not a bundle-size estimate.

| Production route | Total measured transfer | World chunks | Canvas | External requests |
| --- | ---: | ---: | ---: | ---: |
| `/projects` | 266,512 bytes | 0 | 0 | 0 |
| `/services` | 266,028 bytes | 0 | 0 | 0 |
| `/world` | 1,321,092 bytes | 2 | 1 | 0 |

See `production-check.json` for raw results. The world’s total compressed transfer is approximately 1.32 MB, below the proposed ~8 MB starting budget in this environment. Results include the initial page, JavaScript, fonts and physics data. Different hosting/caching arrangements can change transfer measurements.

## Renderer observations

At the entry view: 131 render calls, 4,284 rendered triangles, 81 geometries and 15 textures. The captured reduced-effects view used 80 calls and 3,024 triangles. The captured shoreline view used 70 calls. These samples are recorded in `render-counters.json`.

Repeated entry/exit testing warms the same camera directions before comparison. Initial visit and three returns held at 81 geometries / 15 textures; movement speed remained consistent. This is evidence against listener duplication and steadily increasing scene resource counts, not a measurement of total GPU memory.

Environment: Windows, Node 24.11.1, installed Google Chrome, headless viewport 1440×900, software WebGL permitted. Mobile was emulated at 390×844. No claim is made about physical phone performance or sustained hardware FPS. Audio, game launch/exit, actual contact submissions and production GLB assets cannot be validated because those integrations are not present.

## Actual browser views

- [Entry composition](01-entry.png)
- [Courtyard while exploring](02-courtyard.png)
- [Studio proximity interaction](03-studio.png)
- [HTML project preview](04-project-panel.png)
- [Coastal discovery](05-coast.png)
- [Shoreline boundary](06-shoreline.png)
- [Beach looking inland](07-beach-inland.png)
- [Direct destination directory](08-directory.png)
- [Reduced effects](09-reduced-effects.png)
- [Canonical project route](10-project-route.png)
- [Mobile directory](11-mobile-directory.png)

The scene is intentionally early geometry. Its material palette, proportions and camera can be reviewed before producing a final studio-and-shoreline corner. FightClub remains explicitly unavailable pending a verified build or launch URL; the contact and service details remain pending real content.
