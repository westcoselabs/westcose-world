# Single-cove approval proposal — not implemented

This is an approval-only drawing package. No application, terrain, model, runtime,
collision, building, or route source was edited for this package.

## Drawings

- `peninsula-top.svg` / `.png`: one continuous cove and crescent beach, merging the
  small pocket and northern skinny inlet. The dashed red area is removed terrain,
  not a second bay or a remaining island. Blue is the upper lighthouse trail and
  public cave entrance; the dashed passage starts at that entrance.
- `peninsula-elevation.svg` / `.png`: public-beach elevation and an unfolded
  longitudinal section following the cave beneath the tower.
- `whole-world.svg` / `.png`: current world anchors with the proposed peninsula
  highlighted; mountain, resort, forest, town, skate park, boardwalk and pier stay.
- `town-coast.svg` / `.png`: enlarged current town placement and coastal proposal.
- `index.html`: complete responsive drawing gallery and image links.

## Why the current version shows two coves

The current middle coastal arm spans approximately x34–46, z−6 to +2. It is
represented by both `PENINSULA_COAST` and the northern `PENINSULA_CLIFF_RIM`.
It divides the small sandy pocket (z−20 to −4) from the long inlet (z+2 to +23).
An unconditional northward height blend toward 0.16m in `peninsulaHeightAt`,
combined with the replacement's outer fade, also leaves a thin sandy finger.
The proposal removes the middle arm and resolves these into one basin with only
a northern enclosing arm and the southern lighthouse cape.

## Proposed relationships

- Lighthouse stays at chart [36,−32], at the outer southern tip.
- Existing 12m tower is unchanged; diagrammatic taper is a symbol, not a model redesign.
- Terrace remains approximately 7m above sea, equivalent to the existing radial
  terrain value of 6.2m with sea at −0.8m.
- Public beach and tunnel floor are approximately 0.7m above sea (radial −0.1m).
- The resulting exposed public-side cliff is about 6.3m above the beach.
- Tunnel clear height 4m, clear width 3.4m; about 2m of rock cover at the lighthouse.
- Upper trail stays landward of the cove back cliff; lower passage goes directly
  beneath the lighthouse and exits onto the southern end of the enlarged cove.

## Interpretation limits

These are schematic design drawings, not implemented geometry, rendered game
cameras, engineering sections or performance/traversal evidence. Horizontal
spacing is illustrative. Top views use the existing unwrapped authoring
coordinates, with independent display scales for legibility; these are not
equal-area surveys. The globe radius and geographic movement remain unchanged.
Source-sampled height colors in the world underlay are not proposed art materials.

The northern edge of the proposal must be blended into unchanged mainland during
implementation; the sharp color transition in the drawing denotes the proposal
overlay, not an intended cliff or terrain seam. Beach silhouette and exposed cliff
relationship require user approval before implementing or validating traversal.

## Reproducibility and preservation

`scripts/snapshot-single-cove-proposal.mjs` reads the world sources in memory and
records a compact sampled underlay and exact anchor metadata in
`current-world.json`. `scripts/render-single-cove-proposal.mjs` combines that
snapshot with the drawing-only template, exports drawings, checks 320/390/736/1100px
layouts and verifies the world source fingerprint did not change.

Source fingerprint before and after drawing generation:
`42d61032e0b2a6e1436a700f395df05d90a8a6bfc30259a5367062260f7c9400`.

Approval requested: one enlarged cove boundary; lighthouse cliff and cave section.
The previous implementation review is preserved separately and is not replaced.
