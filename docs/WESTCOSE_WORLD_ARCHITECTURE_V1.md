# WestCose World — Creative Direction and Architecture

**Date:** September 5, 2026  
**Status:** Proposed direction and implementation handoff; not yet approved or implemented  
**Recommended working concept:** Dead Coast Creative District  
**First release:** A single-player, freely explorable portfolio district  
**Platform:** Existing Next.js application; desktop-first, with useful mobile and non-WebGL access

## 1. Decision summary

Build a compact, authored place that visitors can explore, not an enormous empty open world. Use Next.js for the website and canonical portfolio routes, React Three Fiber with Three.js/WebGL2 for the world, Rapier for collision-aware movement, and ordinary HTML for reading and contact actions.

Begin with a procedural graybox: a simple environment built from boxes, planes, cylinders, and ramps. Prove movement, camera behavior, one real project interaction, and a game-launch/return flow before commissioning the entire asset library.

Blender is optional for that first playable. It is recommended for the production asset pipeline. Keep editable source scenes and generation scripts, export optimized GLB assets, and assemble them through a typed placement manifest. Do not make one giant model responsible for rendering, collisions, content, and gameplay.

Astra is the development assistant, not a required runtime service. Ordinary exploration, portfolio reading, and game launching should make no model API calls.

## 2. Evidence, assumptions, and existing-project boundaries

### Reference research

Abeto's designer/developer Vicente Lucendo confirms that Messenger uses Three.js, Blender and Houdini, plus custom shaders, controls, camera, networking, and backend. Its spherical layout allows continuous travel, and automated camera centering supports non-gamers. This is evidence for those choices—not evidence that Abeto uses our proposed React/Rapier stack. [S1]

The live URL was opened, but its WebGL scene was not available to the text inspector. This document is not a source-code audit, network capture, or hands-on gameplay report. Do not copy the reference's artwork, models, shaders, or proprietary implementation.

### Existing WestCose sources

The supplied Labs OS brief already reserves World.exe and `/world` for a future Three.js experience. The architecture specifies shared content, direct routes, heavy-experience lazy loading, and repository-controlled assets. The Pocket brief initially permits a lighter World experience. These are useful integration foundations.

The supplied implementation plan is a historical starter audit. It is not evidence of today's installed packages, source layout, or remaining work. The later project update removed public Normal View controls while preserving semantic fallback behavior. Preserve that newer decision; do not resurrect outdated controls from the initial briefs.

Treat this World phase as an explicit expansion of the earlier V1 scope, which deferred Three.js. Do not interpret that historical deferral as a ban on the feature now requested.

### Repository boundary

This plan assumes an initial `/world` feature in the Labs application. Verify the actual repository before editing. WestCose Designs, Labs, and Shop remain distinct properties. The world may link to Designs and Shop, but it should not silently absorb those websites or replace the approved marketing site's orbit scene.

No current repository, package lock, final logo asset, or FightClub source build was inspected for this plan. Start with a real audit. Preserve all existing user-owned changes and do not push, publish, or create a remote without authorization.

## 3. Five original concept directions

### A. Dead Coast Creative District — recommended

A fictional California coastal-industrial district occupied by designers, developers, skaters, and independent makers. The environment combines corrugated workshops, concrete courtyards, weathered signboards, an arcade, an old communications booth, utility poles, and a short shoreline path.

Use compact, sculptural geometry; matte black painted steel; pale concrete; bone-colored signs; faded blue; warm workshop lighting; and the user's actual WestCose illustrations on murals, posters, and objects. Make it feel like a carefully art-directed miniature, not photorealism and not a generic neon city.

Projects occupy studio bays and display walls. Services live in the fabrication workshop. About lives in a personal workspace. Contact is a clearly marked communications station. FightClub opens from the arcade. A salvage corner holds nonessential abandoned ideas.

Signature encounter: a yard that looks ordinary from the entrance reveals a giant WestCose sculpture and an arcade humming behind a raised roller door.

### B. Outpost 09

A desert-edge creative compound with low buildings, a motel office, repair garage, drive-in screen, satellite dishes, a water tower, dusty roads, and a sunset horizon.

Use warm sand, oxidized orange, charcoal, faded blue, chunky signage, and restrained analog technology. This direction emphasizes Bakersfield's industrial/desert character rather than the coast. The motel office becomes About/Contact; the garage becomes Services; individual workshop units become Projects.

Signature encounter: a seemingly deserted drive-in switches on to reveal a reel, while a small arcade remains open nearby.

### C. The Scrapverse

The visitor is miniature inside an oversized WestCose creative workspace. A sketchbook forms a plaza, a marker becomes a bridge, printed boards become buildings, and discarded hardware forms a small town.

Use strong scale contrasts, recognizable tools, actual artwork, carefully limited surface detail, and physical object materials. Projects appear as prints and models; Labs occupies reclaimed computer hardware; FightClub lives inside a game cartridge or tabletop arcade.

Signature encounter: walk beneath a huge skateboard deck to discover a hidden development bench.

The main design risk is coherence. Establish one scale rule and a limited material kit rather than creating an arbitrary collection of oversized objects.

### D. After Hours Boardwalk

A compact coastal strip with a surf/skate shop, pier-side arcade, print studio, project billboards, a diner booth, and a service garage.

Use weathered enamel, black timber, cream signs, faded blue, and selective warm practical lights. Preserve clear silhouettes and readable exposure rather than making the entire world dark. Strongest for WestCose's apparel and lifestyle personality; distinguish the Labs areas with tools, screens, and process exhibits.

Signature encounter: a low-key storefront opens into a surprisingly expansive arcade interior loaded as a separate room.

### E. WestCose Microplanet

A small, fully walkable planet made of industrial yards, creative workshops, a rocky coast, and a few oversized WestCose landmarks. This most directly carries forward the earlier world/planet language without copying Abeto's illustration style.

The player must genuinely travel around a curved surface. This changes player orientation, gravity, camera framing, placement transforms, and level testing. Do not fake spherical traversal with a flat controller and present it as equivalent.

Signature encounter: rounding a ridge reveals the arcade and studio district over the curved horizon.

## 4. Recommended creative specification

### Art target

**Handcrafted coastal-industrial miniature with streetwear graphic attitude.**

Prioritize large shapes and readable materials. Let the existing WestCose artwork provide individuality instead of relying on a heavy post-processing filter. Use a bright enough sky and warm low sun so black buildings remain visible. Moody does not mean underexposed.

Use bold condensed uppercase typography for architectural signs, neutral readable type for portfolio content, and a restrained monospace for small system labels. Preserve the current site's approved typography for shared content unless a deliberate change is approved.

Use exact logo files as decals, imported vector geometry, or clean textures. Do not ask a generative 3D model to reinterpret the WestCose mark. Do not treat a rendered concept image as a production model.

### First district

Working graybox size: approximately 80 × 80 meters, adjusted after playtesting. One central yard with a visible route to the studio, workshop, arcade, and communications station. Aim for a first interesting object within a few seconds of movement and important destinations reachable without a long walk.

| Place | Function | First implementation |
|---|---|---|
| Entry yard | Orientation, controls, visible destination board | Spawn, clear sign, quick links |
| Studio wall/bay | Selected projects | One real project preview and case-study link |
| Workshop | Services | Existing services content/actions |
| Personal workspace | About | Existing About content |
| Communications station | Contact | Existing verified contact actions |
| Arcade | FightClub and future games | Game registry plus launcher |
| Salvage corner | Optional discoveries | Add after core navigation works |

Keep at least two destinations visible from spawn. Build a loop through the district instead of several dead-end paths. Use coastline, walls, and architecture as understandable boundaries.

### World topology decision

Recommend flat/rolling terrain with ordinary downward gravity for the first district. It delivers free exploration without spherical-camera complexity.

If Microplanet is selected, replace—not append to—the first movement milestone with a spherical movement spike before final asset production. Rapier provides a configurable character-controller up vector, but that alone does not implement spherical gravity, camera transport, or orientation. [S4]

For a spherical world, derive local up from `normalize(playerPosition - planetCenter)`, project movement onto the tangent plane, apply inward gravity or ground constraint, and smoothly transport camera orientation. Test a full circuit, pole crossings, slopes, recovery, and camera horizon behavior. Do not mix asset placement conventions between flat and spherical implementations.

## 5. Technology decisions

| Layer | Proposed choice | Responsibility |
|---|---|---|
| Website | Existing Next.js App Router + TypeScript | Routes, metadata, content, HTML UI |
| Scene composition | React Three Fiber | React-oriented scene lifecycle |
| Renderer | Three.js WebGLRenderer / WebGL2 | Initial real-time rendering target |
| Helpers | Selective Drei helpers | Model loading and narrowly useful utilities |
| Physics | Rapier through `@react-three/rapier` | Collision-aware character and simple props |
| World UI state | Scoped reducer/context | Loading, reading, menus, game handoff |
| Frame state | Mutable runtime objects/refs | Transforms, velocity, camera state |
| Content | Existing typed registries and MDX | One source of truth |
| Assets | Procedural geometry + exported GLB | Authored environment and characters |
| UI styling | Existing CSS Modules/design tokens | DOM controls and reading panels |
| Tests | Existing unit tooling + Playwright | Contracts, controls, route/lifecycle tests |
| Hosting | Existing Vercel project | Website and initial static assets |

R3F's documented pairing is Fiber 9 with React 19; the Rapier wrapper documents v2 compatibility with that combination. Inspect the real dependency tree and current peer dependencies before installing anything. Do not force incompatible versions or upgrade the entire app for this feature. [S2][S3]

WebGL2 is the initial renderer choice, not a declaration that WebGPU is impossible. Three.js has a WebGPU renderer with fallback support. A later renderer evaluation should be driven by a concrete visual/performance need and shader compatibility, not novelty. [S5][S6]

Keep the initial client runtime free of a database, authentication, multiplayer, a new CMS, a global state framework, and a second application framework. A self-contained Unity or Unreal workflow is not the proposed path for this tightly integrated portfolio.

## 6. Website and runtime architecture

```text
Existing Next.js application
├── Canonical HTML portfolio routes
│   ├── /projects
│   ├── /projects/[slug]
│   ├── /services
│   ├── /about
│   ├── /contact
│   └── /games/[slug]
└── /world
    ├── Server: metadata, introduction/poster, fallback links
    └── Client entry
        ├── Lazy world runtime
        │   ├── One R3F Canvas
        │   ├── Scene/environment
        │   ├── Player and camera controllers
        │   ├── Physics
        │   └── Interaction detection
        └── HTML layer
            ├── Controls and quick destinations
            ├── Reading/preview dialogs
            ├── Contact actions
            ├── Loading/error/quality controls
            └── Game launcher
```

Keep World full-viewport rather than inside a small draggable desktop window. Apply the necessary route-specific shell behavior without rewriting the entire OS or adding World to the public display-preference enum.

Entering `/world` is the heavy-experience boundary. No world renderer, physics WASM, world GLBs, or world audio should load on unrelated entry routes. Use a client wrapper for `next/dynamic({ ssr: false })`; the option is not supported directly in a Server Component. Verify conditional loading in the production network trace, including any route prefetching. [S7]

### Content interaction — first version

Approach a project exhibit, see a short action label, and press E or select an accessible button. Open an HTML preview using existing project metadata. Stop locomotion while reading. The complete case study opens its canonical route.

Before leaving the world, save a small return snapshot. Returning restores the visitor beside the exhibit after the relevant ground/colliders are ready. On invalid or obsolete snapshots, use a safe spawn.

This avoids making several live Server Component route trees coexist in the first milestone. It also keeps the full case study indexable and shareable without a GPU.

A later version may use intercepted/parallel routes for full case-study overlays while preserving the world behind them. Next supports this contextual route pattern, but hard loads and refresh must still show the complete destination page. Add it only with explicit history/close tests. [S8]

### Input and lifecycle

Use an explicit mode model such as:

```text
LOADING → EXPLORING ⇄ READING / MENU
                   → LAUNCHING_GAME → IN_GAME → RESTORING → EXPLORING
Any active mode → PAUSED / ERROR / UNSUPPORTED
```

Only EXPLORING accepts movement input. Clear held keys and pointer state on blur, visibility changes, dialog opening, and pointer cancellation. Never intercept movement keys while a form field is focused. Escape closes a dialog or opens pause; a visible button provides the same action.

Pause simulation and rendering when hidden. Do not leave a continuously rendering world under a full-screen game. Cleanup must stop animation work, release listeners/audio, and correctly dispose owned GPU resources. Shared cached assets need clear ownership so one scene does not dispose resources still in use. [S12]

## 7. Movement, camera, and interactions

Use a kinematic capsule for the player, separate from the visual avatar. Start with a simple visible placeholder. Implement camera-relative WASD/arrow movement, walk/run, slopes, low steps, and ground snapping. Jumping and skateboarding are separate features, not prerequisites for portfolio access.

Rapier's controller provides collision adjustment, stairs/slopes support, and configurable behavior; it still requires integration and tuning for this particular world. [S4]

Run simulation on a fixed step with bounded catch-up after a tab stall. Interpolate visual transforms where appropriate. Update fast-moving state through refs/runtime objects, not React setState each frame. This follows R3F's guidance for frame-loop work. [S9]

The follow camera should expose a tunable distance, angle, and damping. Use obstruction tests between the follow target and desired camera position, shorten the camera distance near walls, and smoothly restore it after clearing the obstacle. Avoid uncontrolled camera roll, forced pointer lock, and permanent close-up framing that hides the environment.

Hotspots require proximity, an eligible target, and—where applicable—line of sight. Show one primary prompt at a time. A screen-reader/keyboard-friendly destination list must open the same content without walking.

Keep games and collectibles optional. Nobody must earn access to Services or Contact.

## 8. Data and module contracts

Proposed feature organization, adapted to the actual repository during audit:

```text
src/features/world/
  WorldEntry.tsx
  WorldRuntime.tsx
  scene/
  player/
  camera/
  interactions/
  ui/
  runtime/
  data/
    world-manifest.ts
    world-hotspots.ts
    world-quality.ts
  tests/
public/world/
  models/
  textures/
  audio/
  posters/
art-source/world/
  generated/
  approved/
scripts/world/
  build_graybox.py
  export_world_assets.py
  validate_world_assets.*
```

These are proposed directories, not claims about existing files. Create folders only when consumed. Keep authoring sources outside `public` and out of the runtime bundle.

### Manifest responsibilities

Each placed entity has an ID, asset reference, transform, optional simple collider, and optional interaction ID. Each hotspot refers to a content/game ID; it does not duplicate case-study copy. Each model entry records bounds, source, exported format, version, triangle/material counts, and license/provenance where relevant.

Use stable IDs for the entry yard, studio, workshop, arcade, and communications station. Keep visually decorative objects separate from functional colliders and triggers.

### Coordinate contract

Use one runtime unit per meter and Three.js Y-up. Record the avatar forward convention explicitly and adapt imported rigs once. Blender uses a different authoring axis convention; rely on a verified export/import conversion rather than repeatedly rotating assets by trial and error.

Create a test fixture containing a one-meter cube, a floor, a doorway, and an avatar to validate scale, orientation, feet position, pivot, and material rendering before accepting the asset pipeline.

### Persistence

Reuse existing preferences and discovery systems where they are present. Do not introduce a parallel sound preference or achievement database.

If a new world session record is needed, version it separately and store only small fields: district ID, safe player pose, camera heading, and world-layout version. Validate finite coordinates, boundaries, supported versions, and storage failures. Do not write to storage every frame. Save on navigation, explicit checkpoints, and sensible lifecycle events.

Do not store sensitive information, contact submissions, mesh data, or canonical project content in browser storage.

## 9. FightClub and future games

Treat the arcade as a launcher, not a requirement to rebuild every game with Three.js.

Maintain a discriminated game registry: local lazy module, approved embedded URL, or external URL. Require real launch data before an item can be labeled playable. Existing FightClub's current deployment, source access, controls, and embedding permissions still need verification.

For local games, define load/start/pause/resume/dispose/exit responsibilities. For embedded games, use an explicit origin allowlist and narrow permissions. Browser framing policies can block an iframe; CSS cannot bypass that. Provide an honest external launch when embedding is unavailable. [S13]

Flow: interact with cabinet → launcher/controls → save return position → stop world input/audio/rendering → run game → exit → restore outside cabinet.

Test external navigation and return separately. A cross-origin game cannot be assumed to support a custom pause/exit protocol. Add a messaging bridge only when both sides can implement and validate it.

Do not run the world and several games simultaneously. For demanding game transitions, unmount the world and restore from a snapshot to release GPU memory.

## 10. Asset pipeline and Blender

### First playable

Procedural code creates ground, simple buildings, ramps, signs, and the placeholder avatar. No Blender installation is necessary to run that browser prototype.

### Production pipeline

```text
Approved art references and layout
→ procedural scripts / Blender authoring
→ editable .blend sources + explicit collision proxies
→ GLB export by prop/module/district
→ validation and measured optimization
→ browser material/lighting comparison
→ manifest placement in the Next.js world
```

Blender's CLI supports background Python execution. OpenAI's published Astra workflow demonstrates authoring with `bpy`, running Blender scripts, and inspecting rendered results. The agent still needs access to the machine/environment containing Blender and the project files. Installing Blender alone does not grant that access. [S14][S15]

Prefer a reproducible script-based pipeline initially. An MCP bridge is optional, not a requirement for generating Blender assets. Keep permissions limited to the project and designated output folders. Preserve approved scenes and never silently replace them with generated revisions.

Example shape of the command, after the installed executable is available in PATH and the script exists:

```powershell
blender --background --python scripts/world/build_graybox.py
```

On Windows, the agent should find the actual `blender.exe` path if `blender` is not on PATH. Do not guess a versioned installation directory. Keep Windows/WSL path conventions consistent. An agent in a remote environment cannot assume access to a Blender installation on the user's Windows machine.

### Export and appearance

Export GLB rather than shipping .blend files to visitors. glTF supports specific material representations, not every Blender shader graph; unsupported procedural effects must be baked or recreated for the runtime. Judge the exported scene in the browser, not only in a cinematic Blender render. [S16]

Separate decorative detail from collision geometry. Keep final logo geometry/decals sourced from supplied artwork. A large AI-generated mesh may be useful as an authoring reference, but it is not accepted as web-ready without inspection and optimization.

Use shared materials, instancing for repeated props, and reduced-detail variants when measurements warrant them. glTF Transform provides inspection/optimization tools; Three.js's GLTFLoader supports integrations for compressed assets, including Meshopt/Draco and KTX2 loading. Select a coherent pipeline rather than piling on every compression option. [S10][S11]

Start with simple uncompressed assets to establish correctness. Then introduce one geometry compression path and texture compression where their measured transfer/memory benefit justifies the decoder complexity. Do not degrade small logo type or project screenshots to hit a superficial file-size target.

## 11. Initial performance and accessibility gates

These are proposed targets for WestCose—not measurements of Messenger or guarantees for every device.

| Metric | Initial target |
|---|---|
| World payload before entering World | None on unrelated routes |
| Starter world critical transfer, including runtime/physics/assets | Aim for no more than about 8 MB |
| Starter-world geometry transfer | Aim for no more than about 3 MB |
| Typical visible triangle count | Begin below about 200,000 |
| Typical draw calls | Begin below about 150 |
| Desktop movement performance | Aim for stable 60 fps on the agreed test hardware |
| Optional mobile exploration | Aim for stable 30 fps on a real midrange phone |
| Default material texture size | Usually 1K; 2K for justified hero assets |
| Initial lighting | One main directional light, restrained shadows, no heavy post stack |

Measure transfer size separately from decoded GPU memory. Track frame-time distribution and stalls, not just average FPS. Tune device-pixel ratio and shadows through quality presets. A high-powered development laptop is not the only acceptance device.

Provide a visible pause/exit, direct content links, keyboard controls, focus management, reduced-motion behavior, contrast, and large touch controls. Disable camera bob and unnecessary transitions under reduced motion. Offer a static destination map/list or guided hotspot mode on unsupported/low-power devices; do not display a dead black canvas.

The first mobile release may intentionally remain a lighter World view, consistent with the original Pocket direction. Free-roam touch controls are a later gate, not a reason to block mobile access to portfolio content.

## 12. Testing and agent observability

Create dev/test-only named spawn scenes: entry, studio interaction, narrow doorway, ramp, camera obstruction, and arcade return. Expose read-only runtime state and narrow test setup helpers only in development/test builds. Do not expose production teleport/debug mutation hooks unintentionally.

The idea is to let the agent reproduce a bug and inspect actual state, rather than judging a still screenshot as proof that movement works. OpenAI's Astra game-development guide uses browser inspection, test scenes, runtime counters, and real-control journey tests. [S17]

Required checks include:

- Movement changes position through actual controls; obstacles stop the capsule; ramp/step handling works.
- Camera stays outside tested walls and resumes its follow distance.
- Reading a project stops movement; closing restores focus and control.
- Typing into a form does not move the character.
- A complete project route works on direct load and browser refresh.
- Game launch and exit restore the intended location without duplicate listeners or animation loops.
- Repeated enter/exit cycles do not cause steadily increasing owned GPU resources.
- Tab hiding, browser Back/Forward, resize, loading failure, corrupted storage, and reset recover cleanly.
- No world assets load on ordinary OS routes in a production build.
- Real touch/browser testing supplements headless tests; headless frame rate is not a mobile performance benchmark.

Use existing lint, typecheck, test, and build scripts wherever possible. Add only missing coverage; do not install a second redundant test stack.

## 13. Ordered implementation milestones

### Milestone 0 — verify and preserve

Audit repository identity, git status, existing docs, dependency tree, route/shell integration, app/project/game registries, storage, preferences, and tests. Produce a small implementation map. Establish a dedicated branch only with appropriate authorization. No reset, remote creation, push, deployment, or unrelated redesign.

### Milestone 1 — playable graybox

Add the isolated `/world` boundary, simple district, capsule, collision-aware follow camera, one project hotspot, an HTML preview, canonical route access, pause/reset, and direct navigation fallback. Include automated movement/collision tests and a production build.

Acceptance: a person can enter, walk around obstacles, open real project content, close it, and continue. The result need not have production artwork.

### Milestone 2 — one finished corner

Approve the chosen concept and a street-level reference. Finish the entry yard, studio facade, one artwork display, one landmark, material kit, and one camera composition. Compare browser rendering with the visual target. Prove Blender-to-GLB export here before making the full world.

Acceptance: one actual in-browser view—not just a Blender render—feels recognizably WestCose.

### Milestone 3 — complete useful district

Add remaining project exhibits, Services, About, Contact, wayfinding, and the arcade facade using reusable modules. All portfolio destinations are functional without scavenger hunting.

### Milestone 4 — real FightClub integration

Verify source/deployment and choose the correct launch adapter. Implement load/exit, world pause/unmount, return snapshot, audio coordination, and controls. Do not call a placeholder screen a playable game.

### Milestone 5 — browser and mobile hardening

Optimize transfer/GPU costs, exercise failure cases and input handoffs, implement the lightweight mobile mode, verify real devices, and stage a preview for review. Publish only when authorized.

### Later expansion

Optional collectibles, more small games, an alternate district/interior, character customization, touch free-roam, and eventually multiplayer. Approve each separately.

## 14. Multiplayer, storage, and deployment

Single-player exploration needs no shared-world server or database. Use repository-controlled optimized runtime assets initially. Move large media/builds to object storage only when asset volume or publishing workflow makes it necessary. Keep editable .blend sources out of public deployment assets.

Do not repeat the outdated claim that Vercel cannot serve WebSockets: current documentation lists WebSocket support in beta, with duration/reconnect and shared-state considerations. That does not automatically solve authoritative game simulation or room synchronization. Evaluate a dedicated networking design only when multiplayer is actually requested. [S18]

Keep future online leaderboards, moderation, anti-cheat, accounts, and shared state outside the initial scope. A local discovery flag is not a secure public leaderboard.

## 15. What Astra needs

Give the agent the correct current repository, this plan, a clearly bounded first milestone, and working permission to edit/run/test that project. Supply one confirmed project from the existing registry. Final logo/illustration files and an approved moodboard are needed for the art milestone, not for basic movement.

For Blender production, provide the installed executable location or permission to discover it, an output directory, and permission to run reviewed project scripts. Require editable source, GLB export, preview images, and a short asset validation report.

Use the model only where it is actually available in the user's account/harness. Current documentation lists `codex -m gpt-6-astra`; account rollout and permissions still determine access. [S19]

Have the agent report changes, actual tests run, failures, and missing assets honestly. Never accept a description of how a feature should behave as proof that it was implemented.

## Sources

All sources were checked September 5, 2026. Source-derived implementation facts are distinguished above from proposed WestCose decisions and unverified current-project assumptions.

S1 — Communication Arts, Messenger; first-person responses by Abeto's Vicente Lucendo: `https://www.commarts.com/webpicks/messenger`

S2 — React Three Fiber installation/compatibility: `https://r3f.docs.pmnd.rs/getting-started/installation`

S3 — React Three Rapier documentation: `https://pmndrs.github.io/react-three-rapier/`

S4 — Rapier JavaScript character controller: `https://rapier.rs/docs/user_guides/javascript/character_controller/`

S5 — Three.js WebGLRenderer: `https://threejs.org/docs/pages/WebGLRenderer.html`

S6 — Three.js WebGPURenderer: `https://threejs.org/docs/pages/WebGPURenderer.html`

S7 — Next.js lazy loading: `https://nextjs.org/docs/app/guides/lazy-loading`

S8 — Next.js intercepting routes: `https://nextjs.org/docs/app/api-reference/file-conventions/intercepting-routes`

S9 — React Three Fiber performance pitfalls: `https://r3f.docs.pmnd.rs/advanced/pitfalls`

S10 — glTF Transform CLI: `https://gltf-transform.dev/cli`

S11 — Three.js GLTFLoader: `https://threejs.org/docs/pages/GLTFLoader.html`

S12 — Three.js resource cleanup: `https://threejs.org/manual/en/cleanup.html`

S13 — MDN frame-ancestors: `https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors`

S14 — Blender Python API tips/command-line execution: `https://docs.blender.org/api/current/info_tips_and_tricks.html`

S15 — OpenAI, Architectural visualization with Astra: `https://developers.openai.com/blog/architectural-visualization-with-astra`

S16 — Blender glTF export manual: `https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html`

S17 — OpenAI, Building games with Astra: `https://developers.openai.com/blog/how-to-build-games-with-astra`

S18 — Vercel WebSockets documentation: `https://vercel.com/docs/functions/websockets`

S19 — OpenAI Codex models: `https://developers.openai.com/codex/models`

Project sources: supplied WestCose Labs OS Creative Direction, Pocket OS Mobile Creative Direction, Website Architecture, historical IMPLEMENTATION_PLAN.MD, and the later project conversation update removing public Normal View controls. Verify their current counterparts against the repository before implementation.
