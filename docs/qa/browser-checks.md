# First playable browser checks

Verified September 5, 2026 on Windows using installed Chrome in headless mode. The suite runs against the Next.js development server at `http://127.0.0.1:3000`, with a 1440 × 900 desktop viewport and one worker. Chrome's software WebGL fallback is permitted.

## Commands

| Command | Result |
| --- | --- |
| `npm test` | **14 passed (1.3m)** on the final aggregate run. |
| `npx eslint playwright.config.ts tests/world.spec.ts` | Passed. |

The tests are defined in `tests/world.spec.ts`; configuration is in `playwright.config.ts`. `playwright-report/index.html` contains the generated report and a `world-return-samples` attachment.

## Verified behavior

- Actual keyboard movement, building collisions, and ramp ascent.
- Camera obstruction response and reset to the entry.
- Project interaction through E and a visible button; reading stops movement and Escape restores exploration.
- Canonical project route refresh, browser Back/Forward, and safe return beside the project.
- Pause clears held movement; resuming does not resume a stale key press.
- Typing and filtering in the directory do not move the visitor.
- Malformed saved JSON and an invalid saved position recover to a grounded entry.
- FightClub is clearly unavailable; the cabinet does not pretend to launch a game.
- The shoreline stops forward movement into the water.
- The optional beach discovery opens and persists across reload.
- Three content-route round trips retain stable renderer counts and consistent movement.
- An unavailable WebGL renderer leaves useful direct destination navigation.
- A mobile visitor can use every direct destination without a 3D canvas.

Named spawn fixtures and `window.__WESTCOSE_WORLD__` diagnostics are development-only. Fixtures position each scenario; movement assertions then use actual browser key events. Production network and visual checks are separate from this development-server suite.

## Repeated-return measurements

Each visit returns to the same entry pose and performs the same camera sweep before sampling. This initializes geometry and textures that would otherwise upload at different times when entering the camera's view. Equality checks remain exact across the initial visit and all three returns.

| Visit | Geometries | Textures | Distance during nominal 1-second W hold |
| --- | ---: | ---: | ---: |
| Initial | 81 | 15 | 4.725 m |
| Return 1 | 81 | 15 | 4.725 m |
| Return 2 | 81 | 15 | 4.721 m |
| Return 3 | 81 | 15 | 4.725 m |

No accumulating renderer counts or multiplied movement were observed across these returns. The distance measurement includes browser event scheduling and is used to detect duplicated movement, not to calibrate walking speed.

## Limits

Mobile coverage uses Chrome emulation at 390 × 844 with touch/coarse-pointer input, not a physical phone. The blur test dispatches a blur event, and the unsupported-renderer test deliberately makes WebGL2 context creation fail. These checks do not establish real-device FPS, long-session stability, or total browser/GPU memory use. FightClub integration remains unverified because no game build or launch URL is supplied.
