# Peninsula reconstruction QA

The pre-change preservation evidence is independent of the new peninsula design. `preservation-baseline-v2.json` is the active baseline; version1 remains unchanged as historical evidence. Four `baseline-v2-*` source copies preserve the mixed terrain/layout/landmark files before implementation.

The editable polygon is exactly `(x >= 15 and −43 <= z < −18) OR (x > 24 and −18 <= z <= 30)`. Everything outside is protected, including the entire town/boardwalk overlap where `x <= 24` and `z >= −18`. Changing an allowed access route does not waive that terrain restriction.

Protected evidence includes all9 building records, courtyard/resort areas,17 other routes, spawn and non-local fixtures, skate geometry, other landmark solids,24 fixed runtime/camera/map/pier/vegetation/interior file hashes, mountain/lift/forest/stair source fragments, and123,654 terrain samples. Natural terrain, carved substrate, and final ground support are each compared at1e−8 tolerance. Global sample spacing is0.5 chart metres; the town/boundary grid is0.125.

```powershell
node scripts/check-peninsula.mjs
node scripts/check-peninsula.mjs --sightlines
node scripts/capture-peninsula.mjs
```

The sightline mode compiles the saved pre-change mixed data files and evaluates the two proposed lighthouse anchors with the unchanged third-person camera. Ordinary heading turns are distinguished from default south-facing views. Actual building wall boxes and terrain are tested separately from camera projection. Roof/eave decoration is not included in this numerical building check, so browser review remains necessary.

The capture command writes20 current-state views under `final`, uses no pitch workaround, and records a before/after world-source fingerprint. Run only once source is stable. Final route/terrain checks and actual rendered images must be reviewed together; an in-frame point alone is not evidence of an unobstructed lighthouse.
