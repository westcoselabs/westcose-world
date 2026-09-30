# Snowboard V1

A low-poly snowboarding mini-game inside WestCose World. You start it at the lift-ticket booth beside the ski resort and ride one of four rated runs from the summit. The goal of V1 is to test the physics, the movement and the game loop, not the final art.

## The loop

1. Walk up the forest trail to the resort and stand at the **Lift Tickets** window. Press **E**, or tap the prompt.
2. Pick a run. The menu shows each run's difficulty symbol, rating, length, drop, par time, finish area, best score, medal and challenge stars.
3. You appear at that run's start gate on the summit plateau, facing downhill. A 3‑2‑1 countdown starts the clock.
4. Ride to the finish line. The rider coasts to a stop, then the results appear.
5. From the results you can:
   - **Ride again**
   - **Other runs**, which reopens the ticket menu
   - **Back to resort**, which puts you back at the booth
   - **Explore from the finish area**, so each run delivers you to a different part of the map

Runs are timed, scored and saved on the device. Nothing is sent anywhere.

## Runs

All four runs start on the summit plateau (70.5 m) and drop about 68–70 m.

| # | Run | Rating | Length | Grade band | Par | Finish | Character |
|---|---|---|---|---|---|---|---|
| 1 | Sunday Cruise | ● Green Circle · Beginner | 308 m | 6–19° | 0:31 | Resort Finish | Wide sweeping turns, rollers, two small tabletops |
| 2 | Lighthouse Line | ■ Blue Square · Intermediate | 275 m | 7–24° | 0:27 | East Bluff Run-out, above the lighthouse cove | Banked S-turns, 11 slalom gates, a roller series, three kickers |
| 3 | Timber Chute | ◆ Black Diamond · Advanced | 226 m | 5–36° | 0:26 | West Forest Run-out | Moguls, a narrow glade chute, a 2 m drop, two big kickers |
| 4 | Dead Coast Couloir | ◆◆ Double Black · Expert | 214 m | 6–44° | 0:20 | Resort Finish | Cornice drop-in, a 4.5 m wide couloir, a 2.8 m cliff, a big-air kicker |

**How the runs are built** (`data/ski-runs.ts`):
- **Centreline.** Sunday Cruise and Lighthouse Line are straight legs joined by arcs of radius 13 m and 11 m. Each radius is wider than half the run plus its 5 m feather, so the carved surface never folds over itself inside a turn. Timber and Couloir use a smooth cubic. Every centreline is then Gaussian-smoothed so curvature ramps into each turn.
- **Height profile.** Heights follow the mountain, clamped to the run's grade band. Convex crests are rounded to a per-run radius (40, 30, 22 and 18 m), so the steeper runs throw you more often. The profile is C¹-smooth between samples.
- **Surface.** Each run is carved level across its width and banked into turns. Features are added along the run: rollers, table-top kickers, moguls, drops and narrows. The terrain renderer, the walker and the board all read this one surface.
- **Scenery.** Trees, rocks and lift pylons come from one deterministic list (`data/ski-obstacles.ts`), and physics collides with the same list.

## Controls

| Input | On the snow | In the air |
|---|---|---|
| A / D or ← / → | Carve | Spin |
| W / ↑ (or Shift) | Tuck; skate when nearly stopped | Front flip (press again after take-off) |
| S / ↓ | Hockey stop | Back flip (press again after take-off) |
| Space | Hold to crouch, release to ollie | A release just after leaving a lip still pops |
| J / K / L | — | Indy / melon / method grab |
| R | Restart the run | |
| Esc | Pause: resume, restart or quit to the resort | |

**Touch:**
- A steer pad: drag sideways to carve, up to tuck, down to brake.
- **Jump**: hold, then release to ollie.
- **Grab**: hold in the air. The pad direction picks melon or method.

## Scoring

Tricks, gates and near misses go into a **combo pot**:
- Each one opens a 3-second flow window. Clean carving slows that clock to about a third of normal speed.
- When the window closes, the pot banks at the current multiplier.
- A sloppy landing banks the pot early.
- A crash, or leaving the run, loses the pot and resets the multiplier.

| Source | Points |
|---|---|
| Air time | 10 per 0.1 s beyond the first 0.4 s |
| Spin (to the nearest 180°) | 180 → 100, 360 → 250, 540 → 450, 720 → 700, 900 → 1000, 1080 → 1400, then +400 per 180 |
| Flip | 500 each |
| Grab | 100 + 150 per second held (up to 3 s) |
| Landing | Perfect ×1.25, clean ×1, sloppy ×0.5; landing switch ×1.1 |
| Gate | 150, +50 per gate in a streak |
| Near miss (within a tree's reach at 10 m/s or more) | 150 |
| Carving (clean, loaded, 9 m/s or faster) | 25 per second × multiplier, banked directly |
| Token | 50 each, banked directly; +1000 for all of a run's tokens |
| Finish | (par − time) × 100 |

**Multiplier:** ×1 to ×5.
- +1 for each trick chained inside an open combo.
- +0.5 for a perfect landing.
- +1 for every three gates in a row.
- Carving alone can raise it only to ×2.
- It resets after 6 s with no scoring action.

Trick names follow snowboard usage, for example `BS 540 MELON`, `SW FS 360` and `BACKFLIP INDY`. For a regular rider, counter-clockwise spins are frontside.

**Medals.** Finishing earns bronze. The higher medals need these scores:

| Run | Silver | Gold | WestCose |
|---|---|---|---|
| Sunday Cruise | 2,500 | 6,000 | 10,000 |
| Lighthouse Line | 3,500 | 8,000 | 14,000 |
| Timber Chute | 4,000 | 9,000 | 16,000 |
| Dead Coast Couloir | 4,500 | 10,000 | 18,000 |

**Challenges** (three stars per run):
- **Green:** finish under par; collect 40 tokens; land a 360.
- **Blue:** clear all 11 gates; land a 540; score 8,000.
- **Black:** ride it without a crash; land a backflip; score 9,000.
- **Double black:** finish under par; stick the cliff drop; score 10,000.

**Records** are stored per run: best score, best time, best medal, stars and number of rides. They live in `localStorage` under `westcose-world:snowboard:v1`. Every value is validated on read, and blocked or corrupt storage simply starts fresh.

## Physics model ("balanced arcade")

`snowboard/physics.ts` is pure and deterministic. It runs at a fixed 1/120 s step with bounded catch-up, and the terrain is injected as a sampler.

- **Gravity** is radial, at an arcade 14 m/s².
- **Planet curvature is compensated.** In the air, an extra v²/r pulls toward the centre, and the same term enters the launch test. Jumps and grounding therefore behave like a flat slope of the same angle, even on a 72 m planet where a real board would start floating at about 27 m/s.
- **Board frames** come from the board itself (the heading and the base normal), carried over the curvature in the air. Crossing a pole is safe.
- **Slope normals** are finite differences in the board's frame:
  - On the ground, the along-travel slope is *trailing*, measured from 0.4 m behind the rider to under them. A kicker's lip therefore keeps its angle until the rider passes it.
  - In the air and on landing, normals are centred.
- **Carving:**
  - The edge angle sets a sidecut turn: radius = 8.5 m / sin(edge), up to 54°.
  - At full input the edge is the tightest clean carve the grip allows at the current speed, about 29 m radius at 24 m/s.
  - Grip scrubs lateral speed. A clean carve returns 90% of that energy to forward speed, a skid 25%.
  - Powder and off-piste have less grip and more friction.
- **Speed.** Friction (groomed 0.045, powder 0.11, off-piste 0.42) plus drag gives typical speeds of 12–22 m/s, softly capped at 27 m/s. Tuck lowers drag.
- **Hockey stop.** Braking slows the rider along the line of travel, at about 0.9 g combined with friction. The swing of the board across the line is only a pose on the rider model, so braking never steers you into the trees.
- **Leaving the snow.** The rider launches when their speed away from the next surface exceeds what gravity can pull back in one step. Smooth crests launch at v²κ > g, and lips launch as soon as they're passed.
- **Ollie.** Hold Space to charge for 0.5 s, then release for a pop of 3.3–5.8 m/s, about 0.8 s of air at full charge.
- **Spins and flips:**
  - Spins run at up to 8.8 rad/s and flips at 6.3 rad/s.
  - When you let go, a rotation finishes at the next half turn (spins) or full turn (flips), or eases back if it's only just past one.
  - Board pitch and roll level toward the snow below whenever no flip is in progress.
- **Landing grades** compare the board to the snow in tilt and yaw, where yaw is the smaller of regular and switch:

  | Grade | Yaw | Tilt |
  |---|---|---|
  | Perfect | ≤ 8° | ≤ 9° |
  | Clean | ≤ 35° | ≤ 30° |
  | Sloppy (keeps 72% of speed) | ≤ 60° | ≤ 48° |
  | Crash | beyond that, or an impact above 17 m/s | |

  Short unrotated airs under 0.45 s count as bumps and are always ridden out.
- **Crashes and respawn:**
  - Hitting a tree, rock or pylon above 7.5 m/s is a crash; slower hits bounce off.
  - After a crash the rider tumbles for 1.35 s, then respawns at the last checkpoint at 4 m/s.
  - Water is a crash.
  - Riding more than 9 m past the groomed edge for 1.6 s, or sitting stopped for 5 s, returns you to the checkpoint.

Every feel constant lives in `snowboard/tuning.ts`.

## Camera

- **Chase camera:** behind the travel line.
- **Distance and height:** 5.4 m back and 2.5 m up, growing with speed to 7.6 m and 3.7 m.
- **Direction:**
  - It looks ahead down the slope.
  - It holds steady through airs and crashes, so spins never whip the view.
  - It stays at least 1.1 m above the snow.
- **Field of view:** widens from 52° to 64° with speed, except with reduced effects.
- **Portrait screens:** the camera pulls back further.
- **Lighting:** the sun's shadow camera follows the rider during a run.

## Architecture

| File | Role |
|---|---|
| `snowboard/physics.ts`, `tuning.ts` | Board state and fixed step; feel constants |
| `snowboard/terrain.ts` | World sampler: analytic height, surface kind, obstacle cylinders |
| `snowboard/course.ts` | Progress down a run, gates, tokens, checkpoints, near misses, finish, out of bounds |
| `snowboard/scoring.ts` | Tricks, combos, multiplier, medals, challenges |
| `snowboard/progress.ts` | Device-local records |
| `snowboard/input.ts` | Keyboard, touch and test input |
| `snowboard/rider.ts` | Toon rider model, pose and blob shadow |
| `snowboard/SnowboardController.tsx` | In-canvas loop: steps, course, scoring, camera, rider, tokens and spray |
| `snowboard/ui/*` | Ticket menu, HUD (DOM, updated from its own animation frame), results |
| `runtime/snowboard-session.ts` | Mutable session shared by the world, the controller and the HUD |

`WorldRuntime.tsx` adds two modes: `tickets` (the booth menu) and `snowboard` (a live run).
- **Pause.** A paused run resumes into the run.
- **The walker** keeps its own position while a run is active. `PlayerController` hides the walker and gives up the camera.
- **Leaving a run** teleports the walker to the booth or to the run's finish area.
- **Development debug API:** `window.__WESTCOSE_WORLD__.snowboard` exposes `getState`, `startRun`, `spawnOnRun`, `setInput` and `leave`.

## Out of scope for V1

- Audio
- Online leaderboards
- Ghost replays
- Rails, boxes and a halfpipe
- A chairlift ride (V1 cuts straight to the summit)
- Gamepad support
- A rigged rider and final art

## Tuning notes

- **Par times** are about the speed of a careful bot (0.96–1.18× par in `scripts/check-snowboard.mjs`). A rider who tucks and carves cleanly should beat them.
- **Medal thresholds** assume combos. Flat-ground ollie 360s (roughly 0.8 s of air) are the entry trick; 540s and flips need kickers.
- **Steepness knobs** for a run are the crest radius (natural launches) and the grade band. Feature sizes live in each run's `features`.
