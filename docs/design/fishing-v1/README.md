# Pier Pressure (Fishing V1)

A fishing mini-game at the end of Westcose Pier: "There's always a bigger fish."

It sits between familiar fishing games and something of its own. The familiar parts: cast, fake nibbles, a bite, a tension fight, a catch, a collection and upgrades. The twist comes from two places:
- **Cat Goes Fishing's** re-baiting, and **FFXIV's** "mooch".
- The push-your-luck choice from board games.

Every fish you land can be kept, or hooked back on as live bait for something one step up the food chain. The chain runs from sardines to the Sun. Fish heckle you mid-fight, and Gary the gull steals anything you dither over.

The research behind the design is in the approved plan. In short:
- **Stardew Valley:** its creator says the fishing starts too hard. So the controls here are smooth, every move is telegraphed, and the early tiers are gentle.
- **Animal Crossing:** fake nibbles, a distinct bite sound, and catch puns.
- **Sea of Thieves:** pull against the run, or the line snaps.
- **Fisch and Webfishing:** variants you can see, with value multipliers.

## The loop

1. **Find it.** Walk to the rail gap on the west side of the pier head (prompt "Go fishing · Pier Pressure") and press E. The bait-and-tackle menu opens: start a tide, the Tackle Box, records, the Fish-o-dex, the sound toggle and how to fish.
2. **A tide** starts with 6 worms (more with the Bait Bucket). A plain cast spends a worm; a live-bait cast is free. The tide ends when the worms and the live bait are both gone, or when you end it from the pause panel, keeping the cooler.
3. **Cast.** Hold Space, let go in the gold band for a BULLSEYE. A/D aims across a ±25° fan.
   - Distance (6–17 m past the rail) picks the water:
     - the pilings: fast bites and junk;
     - mid;
     - the deep channel: slower, rarer variants.
   - Holding a full charge too long hooks Gary, your cap or the lantern. It costs time, not a worm.
4. **Wait.** Pale ripple rings drift toward the bobber; bigger rings mean a bigger fish.
5. **Bite.** Up to four nibbles, then the CHOMP.
   - **Too early:** spooked, but the bait stays on.
   - **Too late:** the bait is stolen. That costs the worm, or ends the chain if it was live bait.
   - **Within 0.12 s:** a PERFECT HOOKSET. The fish starts tired and is worth +25%.
6. **Fight.** See the sim model below.
7. **Catch card:**
   - **Contents:** a trophy shot, a pun, the weight, the variant and the value.
   - **Choices:** E keeps the catch; Space hooks it back on as bait. Junk can only be kept or tossed.
   - **Gary** takes it after 6 s. He leaves the very first tutorial catch alone and won't touch the Sun.
8. **Tide Report.** A newspaper page with:
   - a headline;
   - the cooler;
   - stats;
   - new Fish-o-dex entries;
   - three ways out: another tide, the Tackle Box, or leaving the pier.

Records key: `westcose-world:fishing:v1`. It holds clams, upgrades, the Fish-o-dex, records, the daily catch, Gary's thefts and the tutorial flag.

## The place

| Thing | Where (metres across, chart z) | Notes |
|---|---|---|
| Angler | −1.7, rail −0.55 | Mid-segment between rail posts; the bait shack is on the east side, so the camera has open deck behind |
| Prompt (place `fishing`, number 11) | −1.7, rail −1.3 | Radius 2.4; fixture `fishing` stands 2.2 m back |
| Gary | rail post at −0.857 | Perched on the rail top |
| Cooler, bait bucket, A-frame | −1.05, −2.2, −3.4 | Non-colliding, so the `check-planet` tip patrol is unchanged |
| Chalk board | Bait shack's seaward face | PIER PRESSURE · THERE'S ALWAYS A BIGGER FISH |

Shared constants live in `data/fishing-spot.ts`; `fishing/spot.ts` re-exports them.

## The food chain

Base values rise about 3× a tier. A catch is worth base × size (0.8–1.4) × variant × 1.25 for a perfect hookset × 3 for the Catch of the Day.

| Tier | Name | Clams | Creatures |
|---|---|---|---|
| 0 | Snack | 10 | Sardine, Anchovy, Shore Crab (only bolts sideways) |
| 1 | Lunch | 30 | Mackerel, Squid (ink), Sea Bass |
| 2 | Dinner | 90 | Tuna, Halibut (heavy), Octopus (rolls) |
| 3 | Boss | 270 | Swordfish, Marlin (both leapers), Hammerhead |
| 4 | Apex | 800 | Great White, Orca (fake tells) |
| 5 | Myth | 2,400 | Blue Whale, Giant Squid (ink) |
| 6 | Legend | 7,000 | The Kraken, A Submarine (sonar) |
| 7 | ??? | 25,000 | The Sun (glare, line heat). It reads "???" until first landed and can't be bait |

**Bait and ambushes**
- Plain worms draw tier 0, with a small chance of tier 1 in mid water and the channel.
- Live bait of tier k draws k+1, and now and then k+2 (6%, never the Sun).
- An **ambush** ("SOMETHING BIGGER ATE IT!") hits about 6% of fights below tier 6: a fish one tier up takes over the line.

**Junk** (4–18% of plain casts, by zone): boot, sock, traffic cone, rubber duck, a message in a bottle (a note and 25 clams), and a soggy WestCose tee.

**Variants:** Chonky ×2, Shiny ×3, Fancy ×5 (a tiny top hat and monocle), Drip ×5 (a tiny WestCose hoodie), Golden ×10. The odds rise with a perfect hookset, a bullseye, the channel and the Lucky Charm.

## Controls

| Input | Keyboard | Touch |
|---|---|---|
| Cast | Hold Space, release; A/D or ←/→ aim | Hold the round button; drag the pad to aim |
| Strike | Space on the CHOMP | Tap the round button |
| Reel | Hold Space | Hold the round button |
| Steer | A/D or ←/→ against a bolt | Pad left and right |
| Bow | S or ↓ at a jump's apex | Pull the pad down |
| Keep / Bait | E or ← / Space or → | Card buttons |
| Pause | Esc | The settings button |

Decisions only take fresh presses, after a 0.5 s lockout, so a held reel can't choose by accident. No gamepad.

## The fight (sim model)

`fishing/fight.ts` is pure and stepped at 1/120 s. The fish plays a weighted move deck; every move except a rest is telegraphed. Tells run 0.9 s at tier 0 and 0.28 s at the Sun.

| Move | What to do |
|---|---|
| `rest`, `taunt`, `playDead` | Reel. A taunt is a free window with a heckle; a played-dead fish comes back with a 0.25 s "JK!" bolt |
| `run`, `dive` | Let go. Reeling against them spikes the tension |
| `bolt`, `roll` | Steer against the pull. Rolls flip every 0.32 s |
| `jump` | Bow near the apex. A miss jolts the line by the tier's splash, 1.5× if you were reeling |

**Tension.** It follows its target with a 0.12 s lag:
- pull, with the steering factored in;
- plus 0.2 if reeling;
- plus 1.25 × the axial pull while reeling;
- plus line heat (the Sun only).

**Outcomes**
- **Snap:** tension over the limit for the tier's grace (0.35 s at tier 0, 0.1 s at the Sun), or past 130% of the limit at any time.
- **Spit:** under 0.06 for 1.8 s.
- **Spooled:** more than 30 m of line out.
- **Landed:** the fish reaches the rail.

Working the line in the green band (32–86%) drains the fish's stamina, and a tired fish pulls at half strength. Hooked fish from tier 2 up open with a run.

## Camera

- **Ready, waiting and fighting:** over the angler's shoulder, 4.6 m above the deck and 3.6 m behind the rail (4.2 and 3.4 in a fight). From there you see the near water over the rail and the far bobber at least 8° above the water. `check-fishing` asserts both.
- **Fight shake:** grows above 80% tension. Reduced motion turns it off.
- **Catch:** a trophy shot from over the water, looking back between the catch and the angler, with the subject left of the card. Big catches pull back by their length.
- **Tide Report:** a wide shot of the pier head.
- **Clamping and handover:** the camera is clamped with `cameraClearDistance` and honours `debugCamera`. Field of view and near plane are restored on release.

From the pier the fixed sun is about 36° below the horizon, so no sun is visible at the tip. A caught Sun lights the pier through one of the three pooled lantern lights (`CoastalLighting.tsx`, `runtime.fishing.sunLight`). No light is added.

## Architecture

| File | Role |
|---|---|
| `fishing/species.ts` | Tiers, species, junk, variants, every line, Tide Report headlines |
| `fishing/fight.ts`, `fishing/tide.ts` | The pure sims. `tide` covers cast, bite, fight, catch, decision, Gary, ambush and end |
| `fishing/bots.ts` | Expert, casual, masher and AFK players, with reaction delay, jitter, lapses and 30 fps decisions. Used by the checks and the dev `autoFight` |
| `fishing/tackle.ts`, `fishing/progress.ts` | Upgrades and gear; device records, the Fish-o-dex and the Catch of the Day |
| `fishing/scene.ts` | The imperative scene: input, fixed step, angler, rod, line, bobber, ripples, spray, creatures, Gary, Sun glow, camera, HUD snapshot |
| `fishing/FishingController.tsx` | A thin R3F wrapper around the scene |
| `fishing/angler.ts`, `creatures.ts`, `gull.ts` | Procedural, vertex-coloured models; the rod is one instanced mesh |
| `fishing/sfx.ts`, `runtime/sound.ts` | WebAudio sound and the world's one opt-in sound preference (`westcose-world:sound:v1`, off by default) |
| `fishing/ui/*`, `fishing.css` | HUD, Tackle Box menu, Tide Report |
| `runtime/fishing-session.ts` | Session shared by runtime, scene and HUD. Type-only imports, so the planet checks still build `runtime/` alone |

**`WorldRuntime.tsx` integration**
- modes `tackle` (the menu, like `tickets`) and `fishing`;
- the `read()` branch, `startTide`, `finishTide` and `leaveFishing`;
- a dedicated pause panel (the world pause panel stays hidden while a tide is on);
- the Sound toggle in both pause panels.

**Debug API.** `__WESTCOSE_WORLD__.fishing` exposes `getState`, `open`, `startTide(seed)`, `setInput`, `forceBite(species, variant)`, `autoFight('expert'|null)`, `decide`, `endTide` and `leave`.

## Validation

- `npm run test:fishing` (13 checks):
  - determinism;
  - the difficulty bands;
  - the chain;
  - worms;
  - strike timing;
  - Gary;
  - junk;
  - gags;
  - ambush rate;
  - lines;
  - storage;
  - the daily catch;
  - open water and sightlines.
- `tests/fishing.spec.ts`:
  - a full tide through the real prompt, menu, keys, card and report, plus pause and leave;
  - a phone tide;
  - the clothing shop and the Palm Court Services prompt.
- `node scripts/check-fishing.mjs --calibrate` prints the bot table and the tide pacing.

## Out of scope for V1

- Gamepad.
- Multiplayer or online leaderboards.
- Real fish art or GLB models.
- Music.
- Day and night.
- The flock is a gag, not a mechanic.

## Tuning notes

Bot landing rates with base gear (150 fights a tier):

| Tier | Expert | Casual | Masher snaps |
|---|---|---|---|
| 0–1 | 100% | 100% | 0–9% |
| 2 | 100% | 94% | 100% |
| 3 | 100% | 73% | 100% |
| 4 | 100% | 55% | 100% |
| 5 | 99% | 28% | 100% |
| 6 | 98% | 17% | 100% |
| 7 (Sun) | 95% (99% maxed) | 3% | 100% |

**Bot profiles**
- **Expert:** reacts in 0.12 ± 0.03 s and reads every tell.
- **Casual:** reacts in 0.35 ± 0.12 s, misreads 15% of bolts and misses 30% of tells.
- **Difficulty levers:** per-tier force, tell length and snap grace. The masher's failure comes from reeling through the opening run.

**Tide pacing**
- A tide takes roughly 2 minutes (keeping snacks) to 8 minutes (baiting up to tier 4); experts chasing the Sun go longer.
- Upgrades cost 150, 600 and 2,400 clams a level, about 15.8k for everything.
