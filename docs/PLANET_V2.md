# Planet V2

## Current direction

The user's follow-up explicitly selects a spherical planet, continuous walking, close third-person movement, tight alleys, sidewalks, stairs, terrain and an ocean. It supersedes the flat / +Y gravity choice in the original starter and architecture documents. Those documents remain unchanged as historical input.

The reference is [Messenger](https://messenger.abeto.co), with the creator's [Awwwards technical article](https://www.awwwards.com/messenger.html). The article describes a globe with central gravity and a camera that accommodates arbitrary orientations. That is the functional basis here. WestCose's implementation, avatar and scenery are original procedural code; reference assets and game content are not copied.

## Surface and movement

The planet is centered at the origin with nominal radius 36 metres. Longitude/latitude use:

```text
normal = (sin(lon) cos(lat), sin(lat), cos(lon) cos(lat))
position = normal × (36 + surfaceHeight + visitorOffset)
```

World up is the radial normal at the visitor, and gravity points inward. A move rotates that normal along a great circle and parallel-transports the heading and input basis. Longitude is never used to wrap a flat position. The fixed simulation step is 1/60 second, with bounded catch-up after slow frames.

Terrain rendering starts with six subdivided cube faces normalized into a sphere. Shared height functions control land, coast, raised walks, a twelve-step stair and the collision support. Longitude-dependent hills fade near the pole to avoid height discontinuities. Buildings and their collision boxes use the same radial frames: local X east, local Y radial up, local Z south.

A complete equatorial circuit is traversable. Across open water, movement slows to 2.5 m/s and the visitor lowers into the surface. This is a simple swimming state, without waves displacing the collider, underwater play or a dedicated swim animation.

## Camera and interaction

The close follow camera uses the visitor's radial up vector, resolves building obstruction with expanded oriented boxes, and checks the terrain along its ray. A globe overview preserves the visitor position. Its distance accounts for the viewport's narrower field of view, including phones.

Mouse/touch drags act as directional movement gestures. Keyboard directions are relative to the heading at the start of a gesture, which is transported as the visitor moves. This prevents the following camera from feeding back into unwanted circles. Right-drag adjusts the desktop camera.

The HTML interface consists of location text, small field-notes/globe/controls buttons, a nearby-place prompt and compact conversations. There is no large world directory or persistent portfolio panel. Canonical HTML pages remain accessible outside the world. Reading, field notes and controls pause the simulation; blur/visibility changes clear held input.

## World authoring

The strongest authored stretch is Studio Lane: a studio, workshop, arcade, narrow side passages, a contact post, stairs and access to the coast. Additional facade clusters continue around the sphere. Forest and ridge terrain occupy the northern side; water occupies the southern side.

The architecture kit is baked into a few vertex-colored meshes. Signs use generated canvas textures. This keeps object/draw-call counts modest, but the scenery is still an initial procedural art pass, not the hand-modeled richness of the reference. Decorative trees, benches and lamps currently do not have individual player colliders. Buildings and authored terrain are solid.

Change place coordinates in the shared planet data, then use those same radial frames for visuals and interaction. Add verified content to the registry before connecting real portfolio work or a game launcher.

## Storage and runtime

Version 2 checkpoints persist a position, tangent heading and matching spherical coordinates. Malformed, obsolete, impossible or now-obstructed records fall back safely. Version 1 flat-map records are ignored. Field notes are device-local and optional; storage failures do not prevent walking.

The world is a dynamically imported client-only route. Ordinary portfolio pages do not load Three.js. The previous Rapier dependency was removed because this implementation uses a focused spherical kinematic controller. No physics WASM is downloaded.

## Radius 72 and the snowboard mountain (layout version 8)

The planet radius is now 72 m (`MAP_RADIUS`), four times the original surface. The larger radius makes room for mountain revision 4, a 78 m snowboard mountain on a north island. It also puts that mountain around the curve from the pier, which now looks out over open ocean. The 36 m figures above describe the original build.
- **Town, pier, skate park and cove:** they keep their chart coordinates, so building sizes and positions are unchanged.
- **Seam:** the coordinate seam sits in open water at z 380.
- **Planet version:** `PLANET_VERSION` is 8.

The mountain carries four rated snowboard runs and the lift-ticket booth that starts the mini-game. See [Snowboard V1](design/snowboard-v1/README.md) and [its QA notes](qa/snowboard-v1/README.md).

## Validation

See [Planet V2 validation](qa/planet/README.md), `npm run test:planet` for deterministic surface/collision/session checks, and `npm test` for actual browser input tests. Phone testing is browser emulation, not a physical-device performance result.
