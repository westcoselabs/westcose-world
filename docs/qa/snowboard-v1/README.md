# Snowboard V1 — QA

This covers:
- the radius-72 world and mountain revision 4, from Phase 2 (details in [world/README.md](world/README.md))
- the run dressing, from Phase 3
- the playable mini-game, from Phase 4

The design is documented in [docs/design/snowboard-v1](../../design/snowboard-v1/README.md).

## Results

All checks ran on `feature/snowboard-v1` against a dev server on port 3100.

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm run lint` (whole repo) | Pass |
| `npm run test:planet` | 27 / 27 |
| `npm run test:snowboard` (`check-ski-mountain.mjs` + `check-snowboard.mjs`) | 4 / 4 and 11 / 11 |
| `node scripts/check-approved-preservation.mjs` | Pass; protected terrain delta 0 |
| `node scripts/check-single-cove-layout.mjs`, `check-peninsula-routes.mjs` | Pass |
| Playwright, full suite (world, peninsula underpass, snowboard) | 22 / 22 |
| `npm run build` | Pass |

`check-peninsula.mjs` was already failing on a stale pre-mountain snapshot before this work. It still does, because its source hashes also cover `runtime/` and `player/`, which the mini-game extends.

### What the snowboard checks cover

**`scripts/check-snowboard.mjs`** is deterministic and uses the same 1/120 s step as the browser.
- **Flat-ground sanity:** a board at rest stays put, friction and drag slow a moving board, the board stays on the snow, and the heading stays a unit tangent.
- **Crossing a pole:** a straight run passes over a geographic pole with no jump.
- **Curvature compensation:** a 25 m/s board stays grounded on a flat planet with radius 72 m.
- **Carving:** a full carve holds the sidecut radius at 12 m/s, and holds the clean-carve radius at 24 m/s without skidding.
- **Hockey stop:** from 15 m/s the board stops within 8–20 m.
- **Ollie:** a charged ollie gives about 0.83 s of air and lands clean.
- **Kickers:** every kicker on every run launches within 1.6 m of its lip, gives more than 0.3 s of air, and lands past the lip without a crash.
- **Bot rider:** a careful bot rides every run to the finish with no crashes:

  | Run | Time | Par | Ratio |
  |---|---|---|---|
  | Sunday Cruise | 33.8 s | 31 | 1.09× |
  | Lighthouse Line | 27.3 s | 27 | 1.01× |
  | Timber Chute | 24.9 s | 26 | 0.96× |
  | Dead Coast Couloir | 23.6 s | 20 | 1.18× |

- **Scoring rules:** spin values, the perfect and switch bonuses, trick names, chaining and the multiplier cap, flow-window banking, crash loss, gate streaks, tokens, finish bonuses and medals.
- **Course:** every gate is judged once, no token counts twice, and the finish fires once.
- **Records:** corrupt, blocked and partial storage all fall back safely, and records merge correctly.

**`tests/snowboard.spec.ts`** uses real input in Chrome:
- At the booth, **E** opens the run menu, which shows all four ratings. Riding the green run goes through the countdown into the run.
- Real keys work: **W** advances the rider, **D** carves right, **Space** ollies and lands, and **Esc** freezes the clock until the run is resumed.
- A finished run shows the results. **Back to resort** puts the walker at the ticket window, and the menu then shows the new best score.
- On a phone, the touch steer pad appears and the **Jump** button ollies.
- There are no page or WebGL errors.

## Changes found in testing

The first bot rides exposed terrain problems, and they were fixed in the data rather than hidden in the physics:

- **Folded turns.** The rev-4 Sunday Cruise and Lighthouse Line had 4–5 m hairpins, tighter than half the run's width. The carved surface folded inside each turn, leaving roughly 1 m steps. Both runs now use straight legs joined by 13 m and 11 m arcs. They became shorter (308 m and 275 m), smoother and faster.
- **Staircase snow.** Each centreline segment measured distance with its own elevation scale, so the lower segment always won. Off-centre snow became a staircase of about 15 cm steps. Now every query uses one metric, and segments own the space between the bisectors at their ends. The surface is continuous round every bend, and the profile is C¹-smooth between samples.
- **Crests and kinks.** Convex crests are rounded to a per-run radius, and the grade clamp's kinks are smoothed out.
- **Couloir entry.** The cornice drop's shelf climbed uphill, and slow riders stalled in front of it. Drop shelves are now at most level. The cornice moved to 16 m, and its drop is about 1 m.
- **Timber Chute.** The moguls were softened (amplitude 0.42 → 0.30 m, spacing 3.4 → 4.2 m), and glade trees now stand at least 2.2 m from the centreline, which leaves about a 2.9 m lane.
- **Finish fringe.** Where a run meets its finish plate, the run's feather now yields to the plate, so no run can reach past its finish line into the protected town.
- **Physics:**
  - A carve now transfers energy rather than adding speed, which had overshot the intended speed.
  - Ground normals trail the rider, so kicker lips keep their angle.
  - Braking slows the rider along the line of travel; the hockey stop was veering riders into the trees.

## Performance snapshot

These were read from `window.__WESTCOSE_WORLD__` counters in headless Chrome with SwiftShader, at 1440×900. They are useful for comparison, not as GPU timings.

| View | Draw calls | Triangles | rAF (fps) |
|---|---|---|---|
| Courtyard, walking | 85 | 327k | 63 |
| Resort, walking | 75 | 376k | 79 |
| Sunday Cruise, riding | 55 | 276k | 83 |
| Dead Coast Couloir, riding | 80 | 392k | 74 |

The rider is about 25 small meshes, while the walker (hidden during a run) is about 20, so a run costs about the same as walking. Merging the rider into one mesh would be an easy later saving.

## Captures

### Gameplay

`node scripts/capture-snowboard-game.mjs` (with `WORLD_CAPTURE_URL` set) writes [game/views](game/views) and `game/capture-state.json`: 20 views, no errors.

| View | Shows |
|---|---|
| `desktop-booth.jpg` | The Lift Tickets prompt |
| `desktop-ticket-menu.jpg`, `desktop-ticket-menu-controls.jpg` | The run menu with records, and the controls |
| `desktop-<run>-start.jpg` | Each run's start gate during the countdown |
| `desktop-<run>-riding.jpg` | The chase camera mid-run |
| `desktop-kicker-air.jpg`, `desktop-kicker-grab.jpg`, `desktop-kicker-landing.jpg` | A spin and an indy off the Lighthouse Line kicker. The landing frame shows the trick popup ("FS 180 INDY · PERFECT · SWITCH"), the combo box and the multiplier |
| `desktop-paused.jpg` | The pause panel during a run |
| `desktop-results.jpg`, `desktop-explore-from-finish.jpg` | The results panel, and the walker at the resort finish afterwards |
| `phone-ticket-menu.jpg`, `phone-countdown.jpg`, `phone-riding.jpg` | The phone layout with the steer pad and the Jump and Grab buttons |

### World and mountain

`node scripts/capture-snowboard-world.mjs` refreshed [world/views](world/views): 34 desktop and phone views, no errors. They include the open-ocean pier view, the resort and ticket booth, every run's start and middle, and the globe with the re-routed runs.

## Known limitations

- **Water by the Timber run-out.** There is a pre-existing low, wet area about 9 m beside the Timber Chute run-out. Riding wide there ends in a splash and a respawn at the last checkpoint.
- **Headless tests run slow.** Headless SwiftShader can render below 12 fps, and then the fixed-step physics runs slower than real time. The browser tests therefore poll run state rather than assume timings.
- **Not measured.** Phone results come from browser emulation, not a physical device. There is no audio yet.
