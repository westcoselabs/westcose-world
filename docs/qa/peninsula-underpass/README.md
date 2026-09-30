# Lighthouse underpass — topology and traversal QA

Status: final structural review package, with 20 desktop/phone views and no capture errors. This is not texture, styling or artwork approval. The earlier peninsula geography was rejected and remains preserved under `../peninsula-rebuild`; none of its passing technical reports imply approval of this topology.

Open `index.html` for the review gallery or `local-map.png` for the annotated plan and under-lighthouse section. The final captures share unchanged world-source SHA-256 `42d61032e0b2a6e1436a700f395df05d90a8a6bfc30259a5367062260f7c9400`. Two town-facing lookout views were retaken from the verified, walkable upper point `[33.1, −35.5]` against that identical source, replacing their prior fixture metadata in the manifest. Camera settings were not changed.

Focused verification: **13/13 passed**; **122,869 protected terrain samples unchanged**; **3,204 boundary continuity samples passed**. Actual render rays beneath the lighthouse hit the lower floor at −0.1000m and roof at 4.1954m, leaving 4.2954m clear height and 2.0046m of rock below the upper foundation. The normal town-facing lookout uses the full 4.8m camera distance; the underpass naturally shortens it to 2.94m. Exact courtyard views remain subject to protected-building occlusion; close and phone views may crop landmarks normally.

## Source-of-truth relationships

The lighthouse is on the outer tip at `[36, −32]`, base elevation 6.2m, with the existing 12m model. The low public entrance starts at `[28, −29]`. Its tunnel passes **directly below the lighthouse foundation** at `[36, −32]`, then turns toward the cove behind the tower, ending at `[38, −20]`. The cave floor is −0.1m, clear width 3.4m, clear height 4m. A separate upper path reaches the tower terrace.

The fixed tunnel points are `[[28,−29],[31,−30.5],[34,−32],[36,−32],[37,−30],[38,−26],[38,−22],[38,−20]]`. Lower tunnel and upper headland must coexist at overlapping globe coordinates. QA must carry the actual current support height/layer through movement rather than repeatedly selecting the highest radial terrain surface. No automatic layer switching, ceiling penetration, or foundation collision is acceptable during the lower traversal. Tower placement is not chosen or accepted by town-camera framing.

## Immutable preservation derivation

`preservation-baseline-v3.json` is derived from the immutable v2 baseline, not from the already modified app. All protected snapshot data is carried forward unchanged and its serialized SHA-256 is recorded. Every retained terrain row comes directly from v2.

The authorized local region is now exactly `(x >= 15 and −47 <= z < −18) OR (x > 24 and −18 <= z <= 30)`. The sole geographical expansion from v2 is the southern fringe `x >= 15, −47 <= z < −43`, needed to remove the detached old headland remnant. The town/boardwalk overlap `x <= 24, z >= −18`, central pier, mountain, forest, and other protected areas remain outside this change.

V2 had 123,654 protected samples. V3 retains **122,869**, removing exactly **785** rows within that newly authorized southern fringe. Retained natural terrain, substrate and final ground values are compared at 1e−8 tolerance. The old v1/v2 evidence is not rewritten.

Local runtime changes for genuine stacked support are authorized individually in `runtime-change-scope.json`. Four files are listed with their exact purpose; the preservation result continues to record their old/new hashes. They are not silently removed from preservation. All other fixed runtime hashes and protected town/building/layout records remain guarded. Full traversal and ordinary-browser regressions verify the changed runtime behavior.

## Focused evidence

The focused suite checks exact placement, two support radii at the same globe direction, physical traversal under the tower, blocked non-portal side exits, actual rendered floor/roof intersection, upper path and cave edge lanes in both directions, finite portal transitions, cove/ocean access, and the ordinary cove camera. The source-derived map shows both the actual sampled coastline and a vertical section beneath the lighthouse. It is a structural diagram, not generated artwork.

The cove exploration point is `[37, −11]`; its entrance remains behind the lighthouse at `[38, −20]`. Nearby viewing positions and naturally collision-shortened camera distances are not substituted for a walkable route.

## Review sequence

First inspect one early globe context and the public entrance. Full desktop/phone captures wait until the implementation owner accepts those views. Final captures must include the lower walk under the tower, upper forecourt, entrance/exit, cove, and honest town/context views. No camera-framing workaround or custom art is part of this structural pass.

```powershell
node scripts/check-peninsula.mjs
node scripts/check-peninsula.mjs --local-continuity
node scripts/check-peninsula-routes.mjs
```

The once-only baseline derivation command was `node scripts/check-peninsula.mjs --derive-v3`; it refuses to overwrite existing v3 evidence.
