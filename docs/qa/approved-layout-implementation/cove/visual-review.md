# Single-cove structural visual review

Reviewed the actual live Three.js world on desktop (1440 × 900) and phone
(390 × 844). These are runtime captures, not approval illustrations. Exact
fixtures, camera state and source fingerprints are recorded in `capture-state.json`.
The final 20-image capture began at 2026-09-13 19:36:12 UTC, reports zero errors,
and has matching before/after world fingerprint
`c3289e43793c0fb85ce84eac092d078db1cb1ef831d62332db6f7464288490e3`.

- `desktop-globe-hidden-beach-ocean.jpg` and
  `desktop-globe-lighthouse-terrace.jpg`: one continuous crescent bay. The former
  middle divider is absent; the northern inlet belongs to the same basin. The
  lighthouse cape remains joined to the island and follows globe curvature.
- `desktop-public-cave-approach.jpg`, `desktop-covered-cave.jpg` and
  `desktop-hidden-beach-south.jpg`: a public rock opening, real tunnel floor and
  lining, and an opening onto the secluded beach. The tunnel remains beneath the
  unchanged lighthouse foundation, not a painted arch or an upper terrain trench.
- `desktop-hidden-beach-north.jpg` and `desktop-hidden-beach-reverse.jpg`: a low,
  continuous sand crescent, open water to one side and a landward rocky enclosure.
- `desktop-lighthouse-terrace.jpg` and `desktop-lighthouse-toward-town.jpg`:
  an exposed foundation with a walkable upper terrace; terrain does not bury the
  tower base.
- Corresponding phone cave, beach and globe views retain these relationships at
  the normal portrait camera framing.

The independent `scripts/check-single-cove-layout.mjs` check compares the exact
approved polygons, verifies 725 samples across the removed divider are underwater,
and walks the roughly 30.28 m crescent in both directions through the real
collision solver. Each direction makes exactly one cave support-layer handoff.
Screenshots alone are not treated as traversal evidence.

This remains the structural concept milestone. Existing simple materials, signs
and procedural models are retained; no texture, artwork, decoration or general
environment-art pass was performed.
