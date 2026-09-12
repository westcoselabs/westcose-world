# WestCose World final browser validation

Run on 7 September 2026 against the frozen coastal source, after the final 18-view capture finished.

**Full browser suite: 15/15 passed in 2.7 minutes.** One Chrome worker, zero retries, zero skipped tests and zero failures. The suite ran against the existing development server at `http://127.0.0.1:3000`; the production build was deferred until browser testing finished. The underlying `npm test` command was invoked directly as `node node_modules/@playwright/test/cli.js test --reporter=list` using the bundled Node runtime.

Coverage includes:

- Real keyboard travel through a complete great circle and longitude seam, pole crossing, raised surfaces, twelve stairs, wall collision and continued ocean movement.
- Camera obstruction, globe view and return, mouse drag/release, project notes, discovery state, canonical project route return and invalid-checkpoint recovery.
- Pause/input clearing, reduced effects, reset, and the honest unavailable FightClub state.
- Real keyboard entry and exit through all five rooms, including the relocated land-based Arcade.
- Continuous dry walking from the promenade along the complete new timber pier to its fishing head, then back to land.
- Usable HTML destinations without WebGL and phone-emulated touch movement, stopping and field notes.

Every test's final error assertion passed: **zero uncaught page errors or THREE/WebGL/shader console errors**. Source code and test expectations were not changed during this run.

**Deterministic planet suite: 16/16 passed**, with zero failures, skipped tests or cancellations; the test runner reported **208 ms**. This final run includes all authored routes in both directions, five doorways, spherical movement/terrain/session checks, dry pier traversal and width support, all seven guarded perimeter sections, the open promenade entrance and the fishing-head walking loop. Command: `node scripts/check-planet.mjs`, equivalent to `npm run test:planet`.

Desktop viewport was 1440 × 900. The touch case used 390 × 844 with mobile/touch emulation and DPR 1 on this computer. These functional results do not establish physical-phone performance or a sustained frame-rate target. Production payload isolation, visual capture review and performance measurement are separate checks. All test browsers were closed after completion.

Related evidence: [static placement/geometry validation](STATIC_VALIDATION.md), [final coastal footprint audit](coastal-after.json), and [final hinterland audit](hinterland-static.json).

## Follow-up after regional culling and mount-order changes

After the final 20-view capture completed and its browser closed, the frozen source passed **4/4 focused browser tests in 1.5 minutes**, using one Chrome worker with no retries. These covered camera shortening and globe return (25.0 s), pause/input cleanup with reduced effects and reset (21.3 s), real walking entry/exit through all five interiors (23.0 s), and phone-emulated touch movement/release (13.5 s).

All four final error assertions passed with **zero page or THREE/WebGL/shader console errors**. No source code or test expectations changed. The full 15-test result above precedes these rendering changes; this follow-up was the focused four-test selection, not another full-suite run. Deterministic planet tests were not repeated because collision and controller behavior were unchanged.

Command: `node node_modules/@playwright/test/cli.js test --reporter=list --grep "camera shortens|pause clears|each authored room|one-finger"`. Tests used the existing development server on port 3000. All browsers closed before handing control back for final production build and performance measurement; no production build was run during this follow-up.
