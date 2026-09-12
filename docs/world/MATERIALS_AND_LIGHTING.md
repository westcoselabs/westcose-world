# WestCose World — sunset, surface and planting direction

This pass builds on the existing spherical town. Player/camera behavior, content registry and entry interactions stay in their existing modules. The subsequent [coastal layout pass](COASTAL_LAYOUT.md) moves waterfront buildings inland and extends the pier and planting while preserving that architecture.

## Surface system

`scene/materials/WeatheredMaterial.tsx` adds mineral weathering, grit, timber grain, metal patina, staggered paving joints and selective damp roughness to Three.js `MeshStandardMaterial`. A shared 256 × 256 packed scalar texture is generated deterministically in memory, uses mipmaps and repeat wrapping, and is reference-counted across merged batches. It is not a color photograph, so it remains in linear scalar space. There are no texture downloads.

`scene/materials/surface-types.ts` maps the established kit palette to surface families. `SceneryBatch` carries physical texture coordinates and material IDs with the baked vertices. Individual box dimensions and rotations retain consistent texture scale rather than stretching a unit UV across a whole facade. Ground pavement uses authored town coordinates and a distinct material ID at each cell. Bump relief never displaces the support surface.

Paving joints use screen derivatives to stay legible in the distance. Stone bodies vary in tone and warm/cool tint, with chipped mortar edges, small veins and edge dirt. Damp patches vary both diffuse color and roughness, with two composed courtyard patches. Plaster uses restrained relief with concentrated spalling, salt and runoff. Timber and painted metal have distinct grain and patina. Reflections come from the baked environment; there is no screen-space reflection or mirrored scene pass.

The sunset pass fixes two mapping issues exposed by the stronger light: building details now retain height above their actual building floor instead of each primitive resetting to ground level, and stairs/aprons explicitly share chart-space paving coordinates. Retaining faces have vertical mapping. Pavement normals follow its actual triangles, so highlights follow ramps and slopes. These changes do not displace walking geometry or alter collision.

## Light and atmosphere

`scene/CoastalLighting.tsx` provides a low fixed amber sun, cool hemisphere fill, far-side fill, muted peach haze and a steel-blue-to-peach sky. The latest user request supersedes the earlier daylight lighting balance. One 2048 shadow map focuses near the visitor and expands in globe view. The shadow footprint snaps to texels to reduce shimmer. ACES filmic tone mapping, exposure 0.84 and sRGB output are explicit. A small 128-pixel procedural sky PMREM is baked once on mount and disposed on unmount; its environment intensity is 0.24. The ocean follows the same sun and haze, with a restrained analytic glint.

The whole-globe planting pass exposed nearly black groves on the shaded hemisphere. Neutral ambient bounce (0.75), hemisphere fill (0.55) and a fixed far-side fill (0.55) retain visible wood, foliage and walking ground under the same 3.4-intensity sunset. The sun stays fixed; it does not follow the visitor. This adds no lights or shadow passes relative to the sunset setup.

`scene/lighting-anchors.ts` matches the existing physical lanterns. Only three reusable, unshadowed point-light slots illuminate nearby entrances; inside, the two wall lights belong to the active room. Their assignments remain stable when nearest-distance ordering changes and fade when reassigned. They dim out in planet overview. There is no per-building shadow map, bloom pass, downloaded HDR or additional texture for these lights.

Reduced effects disables shadows and haze; foliage wind also respects reduced motion and pause. No postprocessing package or new dependency was added.

## Architecture and planting

`scene/kit/architecturalDetails.ts` supplies layered masonry skirts, coping, gutters, downpipes, lamp housings, trellises and window-box containers. `buildings.ts` adds deeper window reveals, sills and roof seams. Interior detailing remains in `scene/interiors/rooms.ts` and keeps doorways and circulation open.

`scene/vegetation/` separates authored placement, geometry construction and runtime presentation. Branches, layered leaf clusters, shrubs, ferns, dune grasses, ivy and litter are merged into three meshes. The 20 tree positions are checked against the actual town routes, building frames and doorway aprons. Plants do not add decorative mesh colliders.

`scene/StreetPatina.tsx` adds nine fitted soil beds under existing urban trees, five drain grates, two manholes, five paving repairs, three gutter channels and selected rubble/leaf pockets. Two merged meshes add about 3.2k physical triangles without new texture downloads or colliders. These details belong at courtyard and alley edges, keeping doorways and route centers clear.

`CoastalHinterland.tsx` adds 199 accepted cypress/oak trees across twenty authored regions with 708 grass clumps, 135 shrubs, 53 rocky outcrops and three lookouts. Two shared tree archetypes are instanced by species and authored region; ground details and lookout furniture are merged. Connected oak canopy lobes and flattened cypress foliage shelves give the trees stronger silhouettes, with smaller overlapping leaves and supporting twigs. Spherical distance checks preserve planting gaps around routes, buildings and the original twenty trees. Natural-ground trails and planting never change the controller support surface. A separate muted scrub-soil surface softens the high-frequency aggregate used in town, with sage/golden terrain patches under the groves.

The first measurement exposed the cost of submitting groves on the opposite side of the sphere. Regional bounds allow tighter frustum rejection, while `planetOcclusion.ts` hides a batch only when its entire padded bounding sphere lies behind the inner planet's horizon plane and within its silhouette cone. Bounds crossing the horizon remain enabled. This uses a conservative radius below both land and the opaque ocean shell. PlayerController mounts before Environment so the current frame's camera is available to culling; the controller itself is unchanged.

`scene/Pier.tsx` shares the weathered timber material with the town kit. It includes individual crosswise planks, driven piles, cross-bracing and railings, with a shared geometric contract for collision and dry support. `scene/kit/foundations.ts` fits building skirts to the curved ground using the existing structure batch and collider shapes.

## Validation and limits

See `docs/qa/westcose-coast/` for current captures and measurements. Its immediate baseline is `docs/qa/dead-coast-sunset/performance.json`; earlier atmosphere and town expansion reports remain in their historical directories. Actual phone hardware still needs separate testing; desktop touch emulation is not a phone benchmark.

The result remains stylized browser geometry. The reference directs atmosphere, material contrast and composed detail; its cinematic asset fidelity is not a claim of this implementation.

Implementation references: [Three.js standard PBR material](https://threejs.org/docs/pages/MeshStandardMaterial.html), [texture color management](https://threejs.org/manual/en/color-management.html), and the installed Three.js r185 shader/PMREM source.
