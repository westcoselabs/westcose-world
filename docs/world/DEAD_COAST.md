# Dead Coast town expansion

## Architecture

The existing Next.js client boundary, React Three Fiber canvas, player/avatar, fixed-step spherical controller, input, close follow camera, modal interactions and route architecture are retained. No physics package, database or asset download was added.

- `data/town-layout.ts`: authored 26 primary buildings, 12 secondary structures, route polylines, areas and five interior assignments.
- `data/town-types.ts`: shared building, route, area and wall contracts.
- `data/town-surfaces.ts`: terrain substrate, road/walk support, stairs, courtyard and dry pier support.
- `data/planet.ts`: existing sphere coordinate/frame API, district labels, registry-backed places and QA fixtures. Layout version 3 invalidates old moved-building checkpoints.
- `data/building-shapes.ts`: exact tangent frames/floors, open-door shell segments, entrance aprons, interior bounds and simple furniture collision.
- `scene/TownLandscape.tsx`: terrain, authored roads/paths, stairs, courtyard, pier and outdoor composition.
- `scene/Ocean.tsx`: retained inexpensive spherical water shader.
- `scene/kit/`: reusable authored facade/roof archetypes, batching and a shared sign atlas.
- `scene/interiors/`: furnished studio, workshop, arcade, office and hidden converted lab.
- `runtime/planet-collision.ts`: analytic wall/furniture OBBs and exact support planes. Visual decoration has no complex mesh colliders.

The town chart uses x=longitude*36 and north=latitude*36 for authoring only. Runtime positions remain 3D sphere-centered coordinates. Local building axes are X east, Y radial up and Z south, then the authored rotation. A building's front is local +Z. Tangent floors use radial plane intersection rather than pretending a flat floor is a concentric sphere.

## Routes and content

Studio Row bends toward a compact courtyard. Service alleys reconnect behind the studios. Workshop Road opens toward the yard; Salt Road and a narrower passage lead to Unit 09. The beach path reconnects the west side to the boardwalk and pier, with another shore shortcut into the workshop district. The high lane and overlook stairs provide a quieter elevated route.

Five rooms are entered by walking through their doorways. Their roofs cut away locally for the follow camera. Interior proximity interactions are spatially gated so exhibits cannot be activated through an exterior wall. The Arcade references the existing FightClub registry entry. No game build or verified launch URL was supplied; it remains honestly unavailable. Labs is a small additional registry entry and HTML route, without fabricated projects.

## Scope and limitations

Architecture is a lightweight authored kit, not final production art. Decorative stair landings/balconies do not imply every upper story is accessible. Initial pier traversal uses one upper walking surface; walking beneath its deck is not a promised navigation layer. Ocean movement retains the existing water traversal. Final project artwork, service details, personal copy, contact details and the FightClub build remain content inputs.

## Validation

See `docs/qa/dead-coast/` for layout checks, browser screenshots and measured baseline/final performance. The measurement script records frame cadence, draw calls, triangles, resource transfer, readiness and Chrome JS heap. Phone viewport measurements use this desktop GPU, not physical-phone hardware. The separate documentation records actual results after verification.
