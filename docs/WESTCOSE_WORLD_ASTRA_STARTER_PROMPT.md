# WestCose World — Astra First-Playable Handoff

Use this prompt inside the authorized current project. Attach `WESTCOSE_WORLD_ARCHITECTURE_V1.md` and any approved assets. The default creative direction below is a proposal, not an assertion that the user has already approved it. A functional graybox can proceed without final art approval.

---

You are the creative developer and gameplay engineer for WestCose World. Work in the existing authorized Next.js repository. Your task is to deliver the first working exploration prototype, not a finished open world and not a rewrite of the portfolio.

## Read and verify before changing files

Read the current project instructions, package.json, lockfile, route/shell architecture, app/project/game registries, preferences/discovery/storage utilities, relevant tests, and `WESTCOSE_WORLD_ARCHITECTURE_V1.md`.

Inspect git status and identify user-owned changes. Verify that this is the intended Labs/world repository, not a different WestCose property. Do not reset files, discard changes, create a remote, commit, push, or publish without authorization. Do not assume a historical starter audit still describes the codebase.

Provide a short map of what you found and the smallest compatible implementation. Proceed with the bounded local prototype where permission permits. Ask only for genuinely blocking missing information.

The earlier OS briefs contain superseded public Normal View requirements. Preserve the current Desktop/Pocket preferences and existing semantic fallback; do not bring back removed public controls. World is the newly authorized heavy feature, so earlier V1 deferral of Three.js is not a prohibition on this work.

## Goal

At `/world`, a visitor can freely walk around a compact district, collide with the environment, approach one project exhibit, open a readable HTML preview using real existing content, close it, and continue exploring. Complete case studies remain on their existing canonical routes. Returning to World restores a safe position near the exhibit.

The scene must be interactive geometry, not a static render or video. No gameplay or contact information may be trapped behind a required collectible or puzzle.

## Working creative direction

Prototype a compact coastal-industrial WestCose district: a central concrete yard, studio facade, workshop, arcade facade, and communications station. Use simple graybox geometry with a restrained early material palette. Keep the world bright enough to read; no dark generic cyberpunk city, stock fantasy village, Abeto artwork imitation, or unrelated visual redesign.

Use existing approved WestCose assets when available. Do not invent a new logo. Placeholder labels may identify development objects but must not be presented as final artwork. Final art direction is a separate approval gate.

Use flat/rolling terrain for this prototype. World up is +Y; gravity points -Y. Do not implement spherical gravity unless the user explicitly selects Microplanet before this milestone begins. Do not mix flat and spherical assumptions.

## Architecture constraints

Keep Next.js App Router, TypeScript, current styling conventions, shared content, and existing test tooling.

Use Three.js with React Three Fiber, selective Drei helpers, and Rapier through the compatible React wrapper. Audit actual React and package peer dependencies before installing. Install only missing compatible packages. Do not upgrade the whole app or force peer dependencies.

Create a client-side lazy world boundary. Put any `ssr: false` dynamic import in a Client Component. Unrelated OS routes must not request world JavaScript, physics WASM, GLBs, or world audio. Verify production behavior rather than assuming dynamic imports alone guarantee it.

Use one Canvas for the world. Keep reading panels, controls, loading/error states, quick navigation, and contact actions in HTML outside the Canvas. Render the world full-viewport through a targeted shell integration; do not redesign the OS.

Keep frame transforms, camera state, velocity, and input in refs/runtime objects. Use a scoped reducer for mode changes and UI. Do not update React state or localStorage at frame rate.

Separate environment meshes, collision proxies, hotspot/content mappings, camera control, movement, and UI. Reuse project/game registries and discovery/preferences services. Do not duplicate case-study copy in scene files.

## Build this vertical slice

1. A `/world` entry with server metadata, meaningful fallback links, and lazy runtime.
2. A bounded graybox yard with a floor, several buildings/obstacles, a ramp or step fixture, and a safe spawn.
3. A capsule character with camera-relative WASD and arrow-key movement, walk/run, collision adjustment, ground snapping, and reset-to-spawn.
4. A third-person follow camera with tunable framing/damping and wall-obstruction handling. No forced pointer lock.
5. One project hotspot connected to an actual existing project. Show a proximity prompt and support E plus a visible button. Open an HTML preview with a canonical case-study link.
6. Reading/menu modes that stop movement, manage focus, and exit with Escape or a visible close action. Form focus must never control the character.
7. Quick destination links for Projects, Services, About, Contact, and Games that do not require walking.
8. An arcade interaction using the existing game registry. Verify the existing FightClub launch target before calling it playable. If unavailable, report that blocker and provide only an honestly labeled launcher scaffold; do not invent a replacement game.
9. Safe return state when navigating to content or a game. Validate stored coordinates/layout version and restore only after the ground is ready.
10. Loading, error, unsupported-renderer, blur/visibility pause, and reset behavior. Audio stays off unless enabled through the existing consent/preference path.

Do not build final character art, all project exhibits, multiplayer, accounts, a database, online scores, runtime AI NPCs, a CMS, procedural infinite terrain, complex ocean simulation, advanced post-processing, or a full skateboarding game.

## Browser and test requirements

Use the available browser/Playwright tooling to actually exercise the app. Add a dev/test-only way to read player position, mode, current hotspot, and renderer counters, plus named deterministic spawn fixtures. Keep test setup helpers out of production.

Verify movement using real key events, not only teleport helpers. Check collision, ramp handling, a camera-obstruction fixture, opening/closing the preview, canonical case-study navigation, browser Back/Forward, safe World return, pause on blur, and reset.

Verify that UI typing does not move the player. Check repeated world entry/exit for duplicate listeners/render loops. Confirm unrelated routes do not load the world. Run lint, typecheck, relevant tests, and a production build. Report exact commands and outcomes, not generic claims.

A low-power/mobile visitor must receive useful navigation and a nonbroken fallback even when desktop exploration is the only completed control mode. Do not present headless-browser FPS as proof of real-device performance.

## Optional Blender work — only after the playable passes

Blender is not required for the procedural graybox. Do not block the prototype on installing it.

When production assets are authorized, locate the actual Blender executable and use project-scoped Python scripts through Blender's own runtime. Preserve editable .blend files, scripts, GLB exports, preview renders, and asset reports. Never overwrite approved source art without permission. Keep authoring files out of public deployment assets.

Use one meter per runtime unit, explicit naming, verified export axes, simple collision proxies, reusable materials, and exact supplied logo artwork. Verify GLB scale/materials in the browser. Do not assume Blender-only shader nodes, cinematic lighting, or an unoptimized generated mesh will transfer unchanged to real-time WebGL.

## Stop condition and handoff

Stop after the functional graybox passes its acceptance checks. Do not expand into the entire map to compensate for a broken controller or unapproved art direction.

Deliver:
- A local playable route and precise run instructions.
- A summary of files changed and any dependencies added.
- Screenshots of the actual browser prototype and the tested views.
- Test/build outcomes and measured performance counters on the available environment.
- Clear known limitations, missing production assets, and any unverified FightClub integration.
- The next smallest art milestone: one finished WestCose corner, not the whole world.

---

## Later art-pass request

After approving the visual concept and a reference image, use this separate brief:

“Keep the existing working movement, collision, interaction, and content systems unchanged. Finish only the entry courtyard and project studio corner in the approved WestCose direction. Use exact supplied logos and artwork. Establish a coherent material kit, facade proportions, lighting, and one signature landmark. Deliver editable sources, optimized runtime assets, and matching in-browser screenshots. Evaluate the exported result in the actual game camera. Stop for visual review before repeating the style across the district.”
