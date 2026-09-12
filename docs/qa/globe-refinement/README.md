# Globe structural refinement

This folder is separate from the preserved first-pass captures and performance reports in `../globe-concept`. Open `index.html` for the annotated map and browser gallery. The `preview` directory contains explicitly preliminary views, not final verification.

The revised blockout keeps the same true-wrap island and nine closer building blocks while making the mountain a 32-metre asymmetric massif, lengthening the pier to chart z = −47, broadening the beach and mainland, and raising the lighthouse to 12 metres on a 7.8-metre peninsula. The low cave remains a separate full-width passage beneath the rock. The lighthouse trail comes through the alley, joins the beach approach, then climbs the western/southern lip of the peninsula beside the cave; it does not require stacked navigation. The hidden beach opens eastward into the ocean, with no raised trail damming its outlet. The skatepark approach has twelve explicit 0.19-metre stair risers.

The review map samples the actual ground-support field at 0.6 chart metres for the whole island and 0.3 for the town detail. A solid teal line marks the coastline at sea height −0.8. Fine contours mark heights 4, 8, 16, 24 and 31. The height shading is diagnostic, not a proposed final art style. The pier outline and numbered building footprints come from their real shared geometry data. This avoids treating a broad schematic land shape as evidence of the actual coast.

## Reproduce

```powershell
npm run test:planet
node scripts/audit-town-layout.mjs
node scripts/capture-globe-concept.mjs
node scripts/review-globe-concept.mjs
```

The capture and review scripts default to this refinement folder. `WORLD_CAPTURE_DIR`, `WORLD_REVIEW_DIR`, and `WORLD_LAYOUT_OUTPUT` can select another explicit destination. `WORLD_CAPTURE_PROFILES=desktop` limits a preliminary capture to desktop; omit it for the desktop and emulated phone profiles. Browser images are actual runtime views, not generated artwork. Browser viewport emulation does not establish physical-phone performance.

Tests separately check movement, collision, cave-floor precedence across its full width, discrete stair support, pier width including the overlapping head, terrain winding and seam continuity, and the actual summit sightline. Ray clearance alone does not prove that a landmark fits inside the camera frame; the gallery must also be inspected. Final verification results belong in the generated manifests and final verification report, not the preliminary images.
