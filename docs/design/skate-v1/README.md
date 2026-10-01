# Skate V1

Skateboarding in WestCose World, styled on the early Tony Hawk's Pro Skater games. You take a board from the skate shop counter, ride it anywhere outdoors, and play a Game of S.K.A.T.E. in a Venice-inspired concrete park on the west bluff. V1 tests movement, physics and the game loop in low poly. It is not the final art.

## The loop

1. Walk into the **WestCose Skate Shop** on Main Street and up to the counter. Press **E**, or tap the prompt, to take a board. It rides on your back from then on.
2. Outdoors, press **B** or the **Equip skateboard** button to ride. The same button reads **Unequip skateboard** while riding. Boards stay off indoors: rolling through a doorway steps you off.
3. Climb the **grand stairs** at the west end of Main Street. The stairs prompt **Start Game of S.K.A.T.E.** Without a board, the prompt sends you to the shop.
4. The game starts at the top of the stairs, facing into the park, with a 3‑2‑1 countdown. You have **2 minutes** to collect the five letters.
5. The results offer **Play again**, **Keep skating** or **Board off**.

Records are saved on the device under `westcose-world:skate:v1`: board owned, best time, best score, best combo, most letters, games and completions. Every value is validated on read, and corrupt or blocked storage starts fresh.

## The park

The park sits on a plateau 3.25 m above the town, about 44 m by 54 m. Its east edge is the bluff's retaining wall above the West Promenade. Everything is authored in a local physical frame (`data/skatepark-layout.ts`), so bowls keep their true shape on the small planet. The walker, the terrain, the park mesh and the board all read the same analytic surface.

| Feature | Size | Notes |
|---|---|---|
| The Deep End | Kidney, lobes of 5.6 m and 5.0 m radius, 3.3 m deep | Transition to 84°, then 0.35 m of true vert. Built for big air |
| Clover Bowl | Three lobes of about 4.3 m radius, 2.36 m deep | Transition to 82°, 0.12 m vert |
| Snake Run | 31.8 m long, 6.4 m wide | Winds west from a 0.5 m roll-in to a 2.8 m pocket |
| Big Halfpipe | Wooden, 14.4 m wide, 12.7 m long, 3.53 m tall | Transitions to 87° plus 0.5 m vert, 1.8 m decks with railings, open ends, 18-step stairs to the east deck |
| North Quarter | 10 m wide, 2.13 m tall | Deck behind its coping |
| Stair platform | 8 m by 5 m, 1.2 m high | Five-stair with a centre handrail, and a bank up its west side |
| Street plaza | | Funbox (0.9 m) with a top rail, Long Ledge (9 m, 0.5 m), Low Ledge (6 m, 0.38 m), Manual Pad, Wall Bank (1.2 m) against the bluff |

Coping on every bowl and ramp, ledge edges, the funbox rail, the stair rails and town curbs and benches are all grindable. A walker who wanders into a bowl can scramble back out over the vert. The halfpipe walls stay solid; walkers use its open ends or stairs.

## Game of S.K.A.T.E.

Each letter floats where only its trick reaches it. You collect a letter when your body passes within 1.05 m of it.

| Letter | Where | How |
|---|---|---|
| S | 2 m above the funbox top | Ollie off the funbox |
| K | 3 m up, over the Deep End's west wall | Big vert air in the Deep End |
| A | 1.2 m above the Long Ledge | Grind the ledge |
| T | Over the snake's pocket wall | Ride the snake and air out of its pocket |
| E | 3.4 m above the halfpipe's east coping | Big halfpipe air |

## Controls

| Input | Rolling | In the air | On a rail |
|---|---|---|---|
| ← / → or A / D | Turn on the spot (tank steering) | Spin | Balance |
| ↑ / W or Shift | Push | Hold at a lip to transfer instead of locking vert | |
| ↓ / S | Brake | | |
| Space | Hold to crouch, release to ollie | A release just off a lip still pops | Ollie off |
| J | | Flip trick (the stick picks it) | |
| K | | Grab, held (the stick picks it) | |
| L | Pop onto a rail within reach | Grind a rail below | |
| ↑ then ↓ / ↓ then ↑ | Manual / nose manual (balance with ↑ ↓) | Queues a manual for the landing | |
| B | Board on or off | | |
| E | Start a game at the stairs | | |
| Esc | Pause | | |

**Touch:** a steer pad (sideways to turn, up to push, down to brake) plus **Ollie**, **Flip**, **Grab**, **Grind** and **Manual** buttons.

Trick choice follows the stick direction: up, down, sideways or diagonal.
- **Flips:** kickflip, heelflip, pop shove-it, impossible, varial kickflip, 360 flip.
- **Grabs:** indy, melon, method, nosegrab, tailgrab, madonna, benihana.
- **Grinds:** 50-50, nosegrind, 5-0, crooked, feeble. A boardslide comes from steering, or from meeting the rail across its line.

## Scoring

Scoring follows the classic arcade combo rules (`skate/tricks.ts`):
- A combo's value is the **sum of its trick points × the number of tricks**.
- A trick repeated within one combo is worth 25% less each time, down to a quarter.
- Rolling away clean banks the combo. Grinds and manuals keep it open.
- A bail loses the combo.

| Source | Points |
|---|---|
| Flip | 100 (kickflip, heelflip, shove-it), 300 (impossible, varial), 500 (360 flip) |
| Grab | 200–400, plus 140 per second held (up to 3 s) |
| Spin, to the nearest 180° | 180 → 100, 360 → 250, 540 → 450, 720 → 700, 900 → 1000 |
| Grind | 100–250, plus 75 per second |
| Manual | 100 or 125, plus 60 per second |
| Plain vert air | 60 |
| Plain ollie | 30 |

## Physics model

`skate/physics.ts` is pure and deterministic. It runs at a fixed 1/120 s step against an injected surface (`skate/surface.ts`), so the browser and `scripts/check-skate.mjs` run the same code. The rider is a simple capsule (0.3 m radius, 0.85 m half-height). The visible rider and board are child models that only animate tricks, with two-bone IK keeping the feet on the board.

- **States.** The rider is in one of four modes: ground, air, grind or bail.
- **Ground:**
  - The board aligns to the surface normal under it.
  - Unexpected rises above 7 cm are curb or wall faces. Hitting one head-on faster than 7.2 m/s bails; a glancing hit slides you along it.
  - Smooth transitions keep their speed.
  - Pushing adds speed up to 8.6 m/s, with a soft top speed of 17 m/s.
- **Pumping.** Dropping down a transition adds 3.6 m/s², so a bowl or halfpipe builds to the maximum air within two or three passes.
- **Gravity** is radial at 13 m/s². In the air it adds a v²/r term so jumps behave like flat ground on the 72 m planet.
- **Vert lock.** A rider leaving a lip steeper than 58° while rising goes straight up:
  - Horizontal speed is zeroed.
  - The whole speed × 1.25 drives up the wall's line, capped at 11 m/s (about 4.65 m of air).
  - The rider drops back onto the same wall with zero drift.
  - The board keeps the wall's plane, so it re-enters the transition.
- **Transfer.** Holding ↑ at the lip skips the lock. The rider keeps their natural momentum, plus just enough carry over the coping, timed from the rise, to land about 1.1 m onto the deck.
- **Air control:**
  - Spins are an angular rate about the board's up axis, separate from travel. A released spin finishes at the next half turn.
  - Flips run on the visual board only.
  - Ordinary airs level toward the surface below, then snap parallel in the last 1.1 m of a fall.
- **Landing:**
  - Yaw beyond 52° from the travel line (forward or fakie) bails.
  - Within 12° of yaw and 10° of tilt is a **Perfect** landing.
  - There is no air drag. Landing on a transition steeper than 25° carries the whole speed down the ramp; a flat landing keeps the rolling speed.
- **Grinds:**
  - Catch from the air within 0.6 m, or pop on from the ground to a rail up to 1.2 m higher.
  - A balance meter drifts, grows harder over time, and is steered with ← →.
  - Open rail ends throw you off into the air. A rail you just left cannot catch you again for 0.3 s.
- **Manuals** use the same balance meter on ↑ ↓.
- **Bails** tumble for 1.55 s, then you get up where you fell, or at the last safe flat spot if that was water or a wall.

Every feel constant lives in `skate/tuning.ts`.

## Camera

- **Chase camera:** 4.3 m back and 1.85 m up, growing with speed to 5.6 m and 2.4 m. Portrait screens pull back 30% and widen the view.
- **Field of view:** 58°, widening up to 8° with speed, except with reduced effects.
- **Direction:** it follows the travel line on rideable ground and holds steady on walls, in the air and in bails, so spins never whip the view.
- **Vert airs:** the camera waits near the coping and looks up at the rider.
- **Obstructions:** it stays clear of buildings and landmark solids, including the park arch's sign board, and at least 0.9 m above the ground.

## Map rework

- **Downtown** (`data/downtown-layout.ts`, `scene/Downtown.tsx`) is laid out for riding:
  - Main Street is a 7 m carriageway with 2.5 m sidewalks.
  - Pier Street (7 m) runs south to the boardwalk and pier, and Palm Avenue (6 m) is the back street.
  - Curbs are real, grindable steps.
  - Buildings were spread out and enlarged around the wider streets, and more were added so downtown reads bigger.
  - Street palms stand clear of every shop door.
- **The skate shop** is a real interior with a wall of hanging decks behind its counter.
- **The west bluff** (`data/island-terrain.ts`) is a level plateau at deck height:
  - A retaining wall faces the West Promenade.
  - A 16-step grand staircase with three handrails and an arch climbs from the end of Main Street.
  - Steep grass banks drop to the sea on its other sides.
  - The park deck stops exactly at the wall.

## Architecture

| File | Role |
|---|---|
| `skate/physics.ts`, `skate/tuning.ts` | Rider state and fixed step; feel constants |
| `skate/surface.ts` | World sampler: analytic park and town surfaces, capsule obstacles, grind lines with a spatial index |
| `skate/tricks.ts` | Trick catalogs, stick mapping, spin names, combo scoring |
| `skate/input.ts` | Keyboard, touch and test input, manual taps and the grind buffer |
| `skate/progress.ts` | Device-local records |
| `skate/skater.ts` | Toon rider and board model, IK pose, blob shadow |
| `skate/SkateController.tsx` | In-canvas loop: steps, scoring, letters, game clock, camera, rider |
| `skate/ui/*` | HUD (DOM, updated from its own animation frame), results |
| `runtime/skate-session.ts` | Mutable session shared by the world, the controller and the HUD |
| `data/skatepark-layout.ts`, `scene/SkatePark.tsx` | Park layout, surfaces and grind lines; the park mesh |

`WorldRuntime.tsx` adds the `skating` mode.
- `PlayerController` hides the walker while riding and shows the board on its back while you own one.
- Leaving the board hands the walker over at the rider's spot and heading.
- **Development debug API:** `window.__WESTCOSE_WORLD__.skate` exposes `getState`, `giveBoard`, `equip`, `unequip`, `startGame`, `spawnAt`, `spawnPark` and `setInput`.

## Validation

- `npm run test:skate`: vert lock and pumping, transfers onto decks, the five-stair rail, the snake, letter reachability, combo scoring and records.
- `npm run test:planet`: the park's ground, bowl scramble-out, discrete stair treads, and all six doorways.
- `tests/skate.spec.ts`: taking the board, the indoor rule, equip and unequip, the no-board prompt, and a game from countdown to a letter in a real browser.

## Out of scope for V1

- Audio
- Online leaderboards and replays
- Wallrides, lip tricks and reverts
- Gamepad support
- A rigged rider and final art
