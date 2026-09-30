# Peninsula reconstruction QA

Current review status: **REJECTED GEOGRAPHY — historical evidence only**. The user rejected this peninsula topology. Its 36 latest captures are preserved under `rejected-geography`, with earlier 34 views under `revision-1-preview`. Passing technical checks do not mean design approval. The next design must place the lighthouse at the outer tip, with the tunnel directly beneath its foundation and the hidden cove behind it; lighthouse placement must not be selected for town-camera framing.

The pre-change preservation evidence is independent of the new peninsula design. `preservation-baseline-v2.json` is the active baseline; version 1 remains unchanged as historical evidence. Four `baseline-v2-*.txt` source copies preserve the mixed terrain/layout/landmark files before implementation; the `.txt` suffix prevents TypeScript from compiling archived evidence.

The editable polygon is exactly `(x >= 15 and −43 <= z < −18) OR (x > 24 and −18 <= z <= 30)`. Everything outside is protected, including the entire town/boardwalk overlap where `x <= 24` and `z >= −18`. Changing an allowed access route does not waive that terrain restriction.

Protected evidence includes all 9 building records, courtyard/resort areas, 17 other routes, spawn and non-local fixtures, skate geometry, other landmark solids, 24 fixed runtime/camera/map/pier/vegetation/interior file hashes, mountain/lift/forest/stair source fragments, and 123,654 terrain samples. Natural terrain, carved substrate, and final ground support are each compared at 1e−8 tolerance. Global sample spacing is 0.5 chart metres; the town/boundary grid is 0.125. The lighthouse component definitions and visible-detail source are also compared with the saved model: its location may change, its model may not.

```powershell
node scripts/check-peninsula.mjs
node scripts/check-peninsula.mjs --sightlines
node scripts/check-peninsula.mjs --current-sightlines
node scripts/check-peninsula.mjs --cove-grid
node scripts/check-peninsula.mjs --local-continuity
node scripts/capture-peninsula.mjs
node scripts/review-peninsula.mjs
```

The sightline mode compiles the saved pre-change mixed data files and evaluates the two proposed lighthouse anchors with the unchanged third-person camera. Ordinary heading turns are distinguished from default south-facing views. Actual building wall boxes and terrain are tested separately from camera projection. Roof/eave decoration is not included in this numerical building check, so browser review remains necessary.

`--current-sightlines` checks the rebuilt terrain and asserts that the tower's stripe, lantern and top are unobstructed and inside the ordinary desktop and phone camera from waterfront main street `[0, −10]` and the central boardwalk `[0, −16]`. The exact courtyard is obstructed by the fixed shop/motel/alley-room buildings. Close approach views naturally crop a 12m tower; no camera change is used to conceal that limitation. The initial 120-anchor search is retained in `lighthouse-anchor-search.json`; its marginal courtyard-edge result is not a promised view, as decorative roofs/floors are outside the wall-only numerical check.

`--cove-grid` checks dry low-sand visitor placement, capsule contact and ordinary camera distance in four cardinal directions around the hidden cove. It distinguishes safe exploration space from the normal camera retraction beside the cave exit.

`--local-continuity` scans the editable polygon's boundary every 0.05 chart metres, comparing ground height just inside and just outside it at ±0.001. A jump above 0.08m fails. This complements preservation: identical protected samples alone cannot catch a cliff introduced immediately inside the allowed edit boundary. The initial scan caught the lighthouse foundation/route discontinuity along `z=−18`, `x=23.3…24`.

The capture command writes both desktop and phone walking views plus globe context under `final`, uses no pitch workaround, and records a before/after world-source fingerprint. Run only once source is stable. The capture manifest records the exact count. `WORLD_CAPTURE_PROFILES`, `WORLD_PENINSULA_VIEWS`, `WORLD_PENINSULA_GLOBE` and `WORLD_PENINSULA_CAPTURE_DIR` allow clearly labelled focused previews without replacing final evidence. Final route/terrain checks and actual rendered images must be reviewed together; an in-frame point alone is not evidence of an unobstructed lighthouse.

The review generator writes `index.html`, `local-map.svg` and `review-summary.json`. The local map uses actual final ground sampled every 0.5 chart metres; its pale coastline is the sampled sea-level transition, not an illustrative coastline. Gray footprints and the dashed rim project the actual cliff wedge geometry, which is separate from ground support. Colors indicate height only. The hatched town area is protected. The gallery keeps close/far cave entrance, inside passage, all four cove headings, tower context and close approach views together rather than showing only favorable angles.

Final verification reported by the implementation owners: 25 planet checks, 17 browser regressions, 9 focused peninsula checks, 123,654 protected terrain samples unchanged, and 3,124 boundary-continuity samples passing. Build, typecheck and lint passed. The capture manifest and review summary record the current visual results separately.

This pass reconstructs local geography and access only. No custom textures, final art style, artwork, skiing/skating mechanics, or changes to the protected world are part of this review.
