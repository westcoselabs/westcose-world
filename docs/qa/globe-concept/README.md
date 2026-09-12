# Globe concept review

This is the placement and structural pass for the new WestCose map. Open `index.html` for the annotated unwrapped map and actual browser views. `layout-summary.json` records the live map anchors and layout version used to generate the diagram.

The concept has nine building blocks: Portfolio Gallery, WestCose Shop, Skate Shop, Social Club, WestCose Motel, Alley Room, the Boulevard corner building, resort lodge, and ticket hut. Five retain the working content interiors. The remaining destinations are procedural terrain or landmark geometry: skatepark, lighthouse, cave, hidden beach, resort trails, beach, boardwalk, and pier.

Every fresh document load starts in the courtyard, including reloading at another landmark and returning from a content page. Closing a note or switching between walking and globe view preserves the current position. Layout version is **5**; the stored-session record format remains version **2**. Discovery state and existing content destinations are retained.

The same mountain is visible across water from the pier. The radius remains 36, with a 192-metre authored inland span from pier tip to summit and approximately 54.42 degrees across the ocean seam. The periodic chart places its cut in water. Geographic longitude/latitude APIs still describe actual sphere coordinates; map placement uses the separate `world-map.ts` helpers.

## Verification

See [verification.md](verification.md) for the final pass counts and the measured performance comparison, including the remaining desktop overview/frame-time optimization target.

`npm run test:planet` checks the real projection, transport, support, geometry, collision, route connectivity in both directions, three mountain trails, skate bowl and quarter pipe, cave walls and ceiling, five interiors, dry pier edges and rails, and the actual camera-to-summit ray against both sea and terrain. It also checks outward terrain triangles and matching rendered seam vertices: analytic terrain support alone cannot detect an inverted rendered mesh.

`npm test` checks browser controls, pole/seam travel, courtyard reset, working content destinations and overlays, interiors, pier traversal, and phone touch input. Browser captures are visual evidence; they do not independently prove collision or route connectivity.

The baseline in `baseline-performance.json` was measured before source edits with unchanged source fingerprints, using three-second samples on the local development server. Its historical `productionRoutes` field also targets the development server; `routeServerMode` records that explicitly. Phone measurements are desktop viewport/touch emulation, not a physical phone. Before/after measurements should use the same machine and otherwise idle browser.

## Regenerate artifacts

With the development server running:

```powershell
node scripts/audit-town-layout.mjs
node scripts/capture-globe-concept.mjs
node scripts/review-globe-concept.mjs
```

The review generator uses the live town, terrain, pier, projection and landmark data, then indexes the latest capture manifest. Final styling, textures, artwork, ski/skate mechanics and generated production assets remain for the next approval stage.
