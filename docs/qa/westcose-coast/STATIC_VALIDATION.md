# WestCose coast and hinterland: static validation

Validated 7 September 2026. This report covers exported geometry and placement data; browser appearance and performance are separate integration checks.

## Coastal buildings and foundations

The [after audit](coastal-after.json) passes for **all 38 building footprints**, including rotated corners and an interior grid no coarser than 0.35 m. Every footprint is on dry substrate with at least the required 3 m shoreline setback. The [before audit](coastal-before.json) is preserved.

| Building | New chart center | Minimum actual shoreline setback |
|---|---|---:|
| Surf shack | `[4, -16]` | 6.63 m |
| Coast Radio | `[-18, -16]` | 8.34 m |
| Beach hut | `[-7, -16]` | 8.54 m |
| Arcade | `[31, -9.5]` | 11.64 m |
| Pier kiosk | `[34, -15]` | 9.37 m |

The expanded land separates buildings, promenade, beach and water. Distances use the actual substrate/sea intersection on the sphere, sampled at 0.1 chart metres, rather than the decorative shoreline formula. Existing accessory overlaps remain advisory: storage container with fabrication/warehouse, print shed with water works, and motel carport with motel. No new coastal building overlap was found.

Foundation geometry was separately checked across all 38 buildings: finite attributes, outward winding, building-local material height, tops below walking floors and lower edges buried at least 0.08 m beneath the visible substrate/support. The skirts add 3,660 triangles to the existing structure batch, without extra draw calls or colliders.

The saved [route preflight](layout-preflight.json) reports 4,957 centerline samples without wall/furniture/rail obstruction. It complements movement tests and does not prove every path edge. Pier movement/support checks are maintained in `scripts/check-planet.mjs` by the pier implementation task.

## Hinterland

The final [hinterland audit](hinterland-static.json) validates every accepted anchor and all generated geometry attributes. **199 of 236 requested trees** were accepted: 128 oaks and 71 cypresses. With the existing 20 town trees, the world contains **219 trees**. The new hinterland also contains 708 grass clumps, 135 scrub plants, 53 outcrops and three lookouts across 20 regions. Clearance rejection leaves some regional targets unfilled, including High North at 4/10 and Works Fringe at 3/8; these are actual accepted counts.

| Independent check | Minimum |
|---|---:|
| Spacing between new tree anchors, along sphere | 3.304 m |
| New tree to existing town tree | 8.514 m |
| Continuous hinterland trail edge clearance | 1.709 m |
| Town route / doorway clearance | 2.213 m |
| Exact tangent building footprint clearance | 2.289 m |
| Tree substrate above sea level | 0.614 m |
| Low-plant substrate above sea level | 0.598 m |

All tree anchors match their actual radial ground position; low-plant bases are buried 0.018 m. Existing town trunks also retain walking clearance. The final expanded groves and refined canopies contain **162,186 authored physical triangles** in **33 potential render batches**: 29 regional/species tree batches, three ground batches and one lookout batch. Planet occlusion and camera-frustum culling reduce the batches actually rendered; shadow passes can add submissions. These totals are not a measured per-frame draw count. Regional culling leaves the 199 tree anchors and authored geometry unchanged.

The beach radio prop and discovery hotspot now share `COASTAL_RADIO` at chart `[-13, -21]` in `town-layout.ts`. This places the interaction on the beach side of the promenade, clear of the relocated Coast Radio building; the earlier `[-16, -14]` hotspot was at its rear corner. Browser interaction verification is recorded separately.

No new static correctness blocker was found. Spacing concerns trunks; canopies may overlap naturally. Low plants and lookout furniture remain decorative without individual movement colliders. These checks establish neither visual quality nor rendered frame rate, shadow cost or physical-phone performance.

Reproduce with `WORLD_COAST_AUDIT_OUTPUT=docs/qa/westcose-coast/coastal-after.json node scripts/audit-coastal-layout.mjs` (set the environment variable using your shell's syntax), then `node scripts/audit-hinterland.mjs`. Both audits passed again on the final frozen source; full-repository ESLint and `tsc --noEmit` also passed. No browser, application build or runtime source edits were performed during this validation subtask.
