# Live mountain visual review

Captured 27 direct runtime views: 18 desktop (1440 × 900) and 9 phone (390 × 844). The browser was closed after capture. Full player/camera state and fixture coordinates are in `capture-state.json`.

Source fingerprint before and after:

`c3289e43793c0fb85ce84eac092d078db1cb1ef831d62332db6f7464288490e3`

The source stayed unchanged throughout capture. There were no page exceptions, WebGL/shader errors, or unexpected lower-layer/swimming/ungrounded observations at the walking fixtures. One generic resource 404 was recorded in the desktop console; its URL was not recorded, and it did not reproduce during a subsequent fresh `/world` load. It is retained in the manifest rather than silently discarded.

## Structural observations

- The lodge and ticket hut are visibly grounded on their shared base terrace. The gap between them and its continuation to the finish area are open in the normal walking views.
- All three runs were inspected at upper, middle, and lower locations. No sampled view shows a lift post or tree trunk blocking its central walking line. This visual check does not replace the independent collision/traversal checks.
- The lower views visibly reconnect toward the resort buildings; the summit, three separate route corridors, lift alignment, and enlarged snow region are visible in globe context.
- Phone controls remain visible. The ordinary narrow phone camera crops the two resort buildings, so the desktop pair view is the clearer spatial-composition reference.

## Material review concerns

1. `views/desktop-pier-seaward.jpg` and `views/phone-pier-seaward.jpg`: the same mountain's rear and summit flag are visible, but the mountain fills almost the entire seaward frame. There is no visible band of open water between pier and mountain. The runtime's summit-visible framing flag passes; that alone does not establish the intended distant-across-water composition. No camera or geography workaround was applied.
2. `views/desktop-globe-mountain-front.jpg` and `views/phone-globe-mountain-front.jpg`: the route margins have conspicuous stair-stepped dark edges that read as trenches at overview scale. The pictures establish the visible artifact, not its exact cause; inspect overview sampling/material boundaries before changing the approved route geometry.
3. The earlier wayfinding mismatch is fixed in the final captures: the base now reads “SKI RESORT”, the lower finish reads “F / RUN FINISH”, and the run locations use their approved names. This was a metadata correction, not a building or route move.

The first set of all 27 views was inspected, then all 27 were refreshed against the final source. Final resort and mid-run frames were inspected again to verify the label correction. Source fingerprints agree with the final cove captures. The capture process itself does not modify live scene, terrain, camera, or approval-reference files.
