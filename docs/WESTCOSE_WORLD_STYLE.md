---
id: westcose-world-dead-coast
version: 1.0.0
updated: 2026-09-05
scope: /world
concept: Dead Coast Creative District
status: Selected concept; implementation defaults pending first in-browser art review
suggested_repo_path: docs/world/STYLE.md
---

# WestCose World — Dead Coast Style Guide

> A small independent creative district at the edge of the Pacific: sun-worn workshops, bold WestCose graphics, a quiet arcade, a crescent beach, and open water.
>
> **Build a place with character, not a city with filler.**

## 1. Purpose and decision hierarchy

This document defines the visual direction for WestCose World's first coastal district. It is a companion to `WESTCOSE_WORLD_ARCHITECTURE_V1.md` and `WESTCOSE_WORLD_ASTRA_STARTER_PROMPT.md`, not a replacement for the website's architecture or global design system.

**Selected by the owner:** the Dead Coast coastal-industrial direction, with a beach and ocean occupying part of the map to reduce the amount of bespoke environment modeling.

**Specified here as implementation defaults:** the crescent-cove layout, palette, material treatments, building kit, lighting, and review targets. These are starting creative decisions, not claims that final artwork or a finished environment has already been approved.

Apply the following boundaries:

- Use this guide for World environments, props, characters, environmental signage, and World-specific interface framing.
- Keep the existing site's routes, content registries, preferences, and shared UI intact. Do not globally replace the Desktop or Pocket OS theme.
- This selection supersedes the earlier World plan's open choice between five concepts. Prototype flat/gently rolling coastal terrain, not a spherical planet.
- Preserve the current removal of public **Normal View** controls. Keep semantic fallback and direct content access without reintroducing that obsolete UI.
- If a style detail conflicts with movement, accessibility, or measured performance, simplify the detail and record the compromise. Never hide required content to preserve a screenshot.

**Public experience name:** WestCose World.  
**Internal art-direction name:** Dead Coast Creative District.  
Do not rename the company or create a separate Dead Coast brand without approval.

## 2. The creative target

### Handcrafted coastal-industrial, with streetwear graphic attitude

The district belongs to people who build websites, make graphics, develop strange software, print things, skate, and stay late working on games.

It should feel like a real place compressed into a carefully composed game environment. The forms are simplified and slightly exaggerated, but the materials remain recognizable: concrete, powder-coated steel, painted timber, sand, and salt-worn signage.

**Miniature is a craft and proportion reference—not a literal floating display plinth.** At gameplay height, the landscape should feel continuous. Do not put the playable map on a hovering slab, show exposed terrain cutaways, or use extreme tilt-shift blur.

The mood is quiet, independent, and alive. “Dead Coast” does not mean a horror setting, post-apocalyptic ruin, or abandoned town. A warm studio window, a slightly open roller door, and a powered arcade cabinet should suggest that someone is still working.

### Three defining contrasts

| Contrast | Application |
|---|---|
| Heavy architecture / open coastline | Compact workshops frame broad areas of sand, sea, and sky. |
| Restrained materials / bold artwork | Neutral buildings give actual WestCose illustrations room to stand out. |
| Weathered place / precise interaction | Surfaces show use; navigation and portfolio content remain clear and polished. |

**North-star view:** a bone-colored studio sign above a dark roller door, a graphic-covered wall beside a concrete yard, a glimpse of the arcade, and muted blue water beyond a sandy opening.

## 3. Non-negotiable visual rules

1. **Dark materials, readable lighting.** Black-painted buildings must retain visible forms and entrances.
2. **Large shapes first.** Silhouette, proportion, and composition must work before textures or small props.
3. **Actual WestCose artwork supplies the identity.** Do not substitute generic graffiti or invented brand marks.
4. **The coastline is intentional open space.** Do not fill it with objects simply because it looks sparse.
5. **The place is small but connected.** Favor a satisfying loop over long roads and empty terrain.
6. **The default view is the playable camera.** An attractive aerial render cannot compensate for poor ground-level composition.
7. **No required scavenger hunt.** Projects, Services, About, Contact, and Games remain directly accessible.

Avoid photorealistic asset-pack mixtures, neon cyberpunk, tropical-resort styling, pirate scenery, generic fantasy villages, overly cute toy-town proportions, and excessive post-processing. Borrow the reference website's exploration principle, not its art, characters, or world shapes.

## 4. Map composition: the crescent cove

### Overall structure

Build a shallow crescent shoreline with the creative district along its inland edge. The beach becomes a second route between destinations; the ocean forms the open side of the composition.

Begin with an **approximately 80 × 80 meter composition envelope**, adapting the earlier graybox allowance rather than adding a new beach to an already oversized district. Extend the simple ocean surface beyond that envelope as needed to conceal its edges. The envelope is not a requirement to provide 6,400 square meters of walkable terrain.

Use this initial **overview composition allocation**, not a precise surveyed land-use calculation:

| Area | Approximate share | Treatment |
|---|---:|---|
| Ocean and open-water space | 50% | Broad color fields, horizon, restrained surface motion. |
| Beach, wet-sand band, and rocky shoulders | 20% | Simple continuous terrain with sparse repeated detail. |
| District, yard, paths, and inland boundary | 30% | Concentrated architectural and interactive content. |

Adjust those proportions during playtesting. Do not create longer walks just to preserve a percentage.

### Layout relationships

```text
                         OPEN WATER / +Z
                broad horizon; no distant city

            rock shoulder     cove      rock shoulder
                 \________ shallow arc ________/
                    BEACH + WET-SAND BAND
                 /                           \
          beach ramp                       beach ramp
                 \                           /
          PROJECT STUDIO — SHARED YARD — ARCADE
              About nook       |          game cabinet
                        CONTACT STATION
                               |
                           WORKSHOP
                            Services
                               |
                    LOW INLAND RIDGE / -Z
```

The diagram establishes relationships, not exact coordinates. Runtime up remains +Y, with ordinary downward gravity. Use +Z as the initial seaward direction and record any intentional change in the layout manifest.

### Navigation and scale

Place spawn slightly inland of the shared yard, facing diagonally toward the studio and coastline. The ocean should be recognizable immediately without requiring the visitor to turn around. Keep at least two useful destinations visible.

Start with a roughly 12–18 meter-wide shared yard and 4–6 meter-wide primary paths. These are tunable graybox dimensions intended to give the follow camera room to breathe. Avoid forcing the player through narrow decorative doors.

Connect the studio, yard, arcade, and beach ramps into one loop. Keep About close to Projects and Contact close to spawn. The long scenic route is optional; the direct route is obvious.

Use a low ridge, service wall, and building backs to close the inland side. Use two restrained rock shoulders to frame the beach. Do not surround the map with an unexplained invisible wall or a dense forest of replacement assets.

## 5. Destinations: five functions, three building shells

Reduce asset production by sharing spaces instead of commissioning one building per website section.

| Location | Portfolio role | Physical treatment |
|---|---|---|
| Project Studio | Projects, with About in a side alcove | Main facade, shallow open bay, display wall, desk/window detail. |
| Workshop | Services | Adapted version of the studio module with a different roofline and sign. |
| Arcade | FightClub and future games | Compact frontage, roller opening, one cabinet initially. |
| Contact Station | Contact | Small clearly labeled wall-mounted panel or booth beside the yard. |
| Beach Loop | Exploration and breathing room | Two ramps, sand, shoreline, and an optional small discovery later. |

Do not build complete interiors behind every facade. Begin with shallow bays and convincing openings. A later full arcade room can have a separate loading boundary when its content justifies it.

### Signature landmark

Use one oversized WestCose sign or sculpture above the studio corner, visible from both the yard and beach. It should feel fabricated from painted metal or a graphic panel, not like a glowing hologram.

Use exact supplied artwork. If the logo asset is unavailable, use a plainly identified development sign. Do not generate an approximation and treat it as the approved logo.

The arcade is the secondary landmark. Other buildings should not compete with both of these at once.

## 6. Palette

The environmental palette balances warm land with cool water. Keep most architecture neutral; use accent colors in concentrated, meaningful areas.

These are **world material/art tokens**, not automatic replacements for global CSS or approved UI contrast pairs. Lighting and export review may require small adjustments.

| Token | Starting color | Intended use |
|---|---|---|
| `world-bone` | `#E9DFCE` | Main signage, painted trim, light graphic surfaces. |
| `world-concrete` | `#C5BFB2` | Courtyard, ramps, wall caps. |
| `world-sand` | `#CEB586` | Dry beach and upper dunes. |
| `world-wet-sand` | `#AD9775` | Narrow shoreline transition. |
| `world-graphite` | `#242C2E` | Roller doors, painted building sections, frames. |
| `world-weathered-steel` | `#647778` | Secondary cladding and metal fixtures. |
| `world-faded-blue` | `#5B7E8A` | Workshop door, selected panels, clothing accents. |
| `world-shallow-water` | `#649497` | Near-shore water color. |
| `world-deep-water` | `#345E6A` | Main ocean surface and distant water. |
| `world-foam` | `#EBE8D9` | Restrained shoreline strokes. |
| `world-rust` | `#A66A45` | Sparse wear, structural accents, one hero prop. |
| `world-warm-light` | `#E5B574` | Studio and arcade practical-light appearance. |
| `world-sky` | `#C8D7D5` | Bright coastal sky and atmospheric separation. |

Do not make the entire scene orange to suggest sunset. Do not use saturated turquoise resort water. Avoid pure-black surfaces swallowing their own details and pure-white concrete blowing out in the sun.

**Artwork exception:** real project art may retain its approved colors. Give it a neutral frame rather than recoloring client work to match the environment.

## 7. Geometry and architectural language

Use simple, weighty silhouettes: low rectangular volumes, shallow pitched or sawtooth roofs, thick parapets, broad roller doors, and occasional rounded corners where they improve the shape.

### Proportions

Buildings are mostly one story, with an occasional taller roof element. Doors, signs, awnings, and structural edges may be slightly oversized for gameplay readability. Keep the exaggeration consistent; do not combine realistic windows with cartoonishly tiny entrances.

Use bevels selectively on visible hero edges. Preserve crisp graphic surfaces. Avoid both razor-thin construction and swollen, marshmallow-like buildings.

### Detail hierarchy

As an art-effort guide, spend roughly **70% on major forms, 25% on functional secondary details, and 5% on wear and small decoration**. These are not triangle-count quotas.

At a glance, the visitor should read the building, opening, sign, and destination. Up close, they may notice a vent, latch, sticker cluster, or chipped corner.

### Reuse rules

Author one coherent facade kit: wall sections, roller opening, roof pieces, corner trim, sign mount, and window/awning module. Differentiate the studio and workshop through layout, color placement, and graphics rather than unrelated modeling styles.

Use three base rock shapes in varied rotations and scales. Keep repeated shapes recognizable as one geological family. Group small props deliberately; do not scatter clutter evenly across every surface.

## 8. Material and texture treatment

Materials should feel dry, tactile, and simplified. Most surfaces are matte or softly rough, not glossy plastic or chrome.

| Material | Visual recipe | Avoid |
|---|---|---|
| Painted metal | Solid color, restrained roughness variation, small edge wear. | Mirror reflections or metallic-looking paint everywhere. |
| Concrete | Warm gray base, broad tonal variation, limited staining. | Dense photogrammetry noise or heavy cracks on every face. |
| Timber | Muted weathered color, a few broad grain cues. | Individually sculpted splinters and repetitive plank noise. |
| Sand | Smooth color fields, broad dune forms, subtle variation. | Individual grains, dense displacement, or footprints everywhere. |
| Rock | Chunky silhouettes, limited facets, warm/cool face variation. | High-frequency scanned detail that clashes with the buildings. |
| Signs and posters | Crisp supplied art on slightly worn physical surfaces. | Distorted logos, fake readable text, or baked-in blur. |

Weathering belongs where water, hands, wheels, and sun would plausibly leave marks. Do not apply a uniform grunge filter to everything. Keep required words cleaner than their surrounding frame.

Start with shared materials and a small texture set. Follow the architecture plan's usual 1K texture default; reserve larger textures for a specific readability need. Keep production source art separate from runtime textures.

Review material color in the actual browser scene. Do not darken every texture to compensate for an incorrectly exposed lighting setup.

## 9. Beach direction

The beach is a designed space, not unfinished terrain awaiting props.

Use three broad surface bands: warm dry sand, a narrower darker wet-sand band, and muted near-shore water. Give the shoreline a shallow curve rather than a straight edge or a perfect circular island.

Keep the sand navigable and mostly empty. Its main purpose is to open the view, create an alternate walking route, and contrast with the district's hard surfaces.

For the first art pass, limit coastal props to the two rock shoulders, one small driftwood/bench composition, and at most a few clumps of dune grass near boundaries. Reuse assets. Do not add palms, umbrellas, beach crowds, boats, a marina, or a full pier to make the coast feel complete.

### Land and water boundary

Dry and wet sand are walkable. The water is a clearly visible non-walkable boundary in V1; swimming, surfing, underwater movement, and boating are out of scope.

Match the movement boundary to the readable shoreline, not an arbitrary point halfway up the beach. Allow movement along the edge without snagging. Keep visual wave motion small enough that the playable boundary does not appear to drift. An actual off-map fall should recover to a safe shore position.

No essential hotspot belongs offshore. Do not create a floating reward that implies an unimplemented swimming mechanic.

## 10. Ocean direction and cost discipline

### Visual target

A broad, calm Pacific-inspired surface with two or three large color relationships, gentle horizontal movement, and a few pale shoreline strokes. It should look designed even when motion is disabled.

**The ocean is an asset-production strategy, not a guaranteed frame-rate improvement.** Model count alone is not an acceptance metric. Keep the water implementation deliberately small and measure it with the rest of the scene.

### V1 recipe

- Use a simple ocean mesh with enough extent to hide its edges from every supported camera position.
- Make the base water opaque. Suggest depth with an authored color transition, not a visible underwater world.
- Add restrained surface motion only after the static composition works. Prefer a small, bounded shader treatment over simulated waves.
- Represent near-shore foam with a few low-detail strips or a masked shoreline treatment. Avoid layered full-screen transparent surfaces.
- Keep the horizon soft but legible. Do not hide the entire sea behind dense fog.

### Not permitted in the first art milestone

No real-time planar reflections, screen-space reflections, refraction passes, underwater caustics, fluid simulation, FFT ocean system, tessellated wave field, boat wakes, or dense spray particles.

Do not install an ocean package merely because the map includes water. Any later effect needs an explicit visual benefit and an actual performance comparison.

### Reduced-effects appearance

A static water surface, clear color bands, and a simplified shoreline must remain an intentional version of the same design. Removing motion or optional normal detail must not reveal that the ocean is just an unstyled placeholder.

## 11. Lighting and atmosphere

**Default time:** warm late afternoon with a bright, lightly hazed coastal sky.

Use one main directional sun and sufficient ambient/sky fill to separate graphite buildings from their surroundings. Favor light coming across the yard rather than pointing directly into the camera or placing every entrance in shadow.

Keep warm light on architectural edges and cool light in shadows, but do not exaggerate the split into orange-and-teal grading. The pale sand and concrete should make the district feel open.

Studio windows and arcade screens may appear lit without each becoming a separate dynamic light. Limit shadow complexity and follow the quality budgets in the architecture plan.

The base scene must look finished with bloom, ambient-occlusion post-processing, depth of field, grain, and lens effects disabled. Avoid crushed blacks, heavy vignette, long moving shadows from a day/night cycle, and cinematic blur during navigation.

**Lighting acceptance question:** can a visitor identify the door, sign, and adjacent path on the darkest building from the normal follow camera?

## 12. Graphics, branding, and typography

### Brand application

Use exact supplied WestCose logos and illustrations. Preserve proportions, clear space, readable edges, and correct spelling. Map artwork to clean surfaces with adequate UV space; do not stretch it across uneven geometry.

Concentrate branding on the main studio sign, one large wall artwork, and a few secondary applications. A logo on every object makes the district feel like merchandise rather than a place.

Keep client artwork distinct from WestCose environmental branding. Use verified project titles and content from existing registries. Do not invent project results, client names, or contact information.

### Type roles

| Role | Direction |
|---|---|
| Architectural signs | Bold, condensed uppercase; strong silhouette; short words. |
| Portfolio previews and body copy | Existing approved site font and content hierarchy. |
| Small build labels | Existing approved monospace, used sparingly. |
| Actual wordmarks | Original artwork, not a font approximation. |

Use the established condensed display face if available. Do not add a new font family solely to match a moodboard. Keep long reading in HTML, not tiny textures on a distant wall.

Pair playful names with clear functions: **STUDIO / PROJECTS**, **WORKSHOP / SERVICES**, **ARCADE / GAMES**, and **CONTACT**. Humor can live on a small secondary sign, never in place of a business action.

## 13. Character, camera, motion, and sound

### Character

Use a capsule for the first playable. A later character should be a simple, original creative/skater figure with a strong silhouette and a readable light/dark clothing split. A bone-colored upper layer with faded-blue or charcoal trousers is a starting option, not an approved final character design.

Avoid elaborate hair, accessories, or rigging before locomotion works. No user likeness is required. Keep the character secondary to the environment and portfolio.

### Camera

Use the planned third-person follow camera, high enough to read paths and entrances, close enough to appreciate signs and artwork. A starting vertical field of view around 45–55 degrees can be tuned in the graybox; do not treat it as a fixed requirement across all aspect ratios.

Keep the horizon stable. No default camera bob, compulsory pointer lock, constant orbit, aggressive auto-recentering, or dramatic zoom on every interaction. Camera collision and content readability take precedence over a cinematic framing idea.

### Ambient life

One or two quiet animations can establish activity: a subtle water pattern, a restrained sign movement, or a cabinet screen. Do not animate every prop. No ambient animation should be necessary to understand a destination.

Honor the existing reduced-motion preference. Stop decorative movement and avoid camera travel effects where requested. Sound follows the existing opt-in preference; a low surf bed and distant workshop/arcade ambience are optional later additions, not launch requirements.

## 14. World interface treatment

Keep the interface small, clear, and outside the 3D canvas. It belongs to the existing WestCose product family rather than introducing an unrelated HUD style.

Use restrained graphite panels, crisp text, minimal framing, visible focus, and existing semantic controls. Environmental palette colors do not automatically qualify as accessible text/background combinations.

The idle view needs only a compact menu, optional controls hint, and a contextual action when relevant. Do not cover the coast with a permanent dashboard, oversized minimap, quest log, health bar, or fake inventory.

Required actions remain available through a clearly labeled destination menu: Projects, Services, About, Contact, and Games. A project preview stops movement and restores focus/control when closed. Contact must not require walking to the booth.

The mobile/reduced-effects presentation may use a composed preview with accessible HTML destination links. Do not force a tiny landscape controller into Pocket OS or present a noninteractive picture as a playable world.

## 15. Production kit and asset organization

### Minimum reusable kit

| Asset family | Initial scope |
|---|---|
| Land | One connected ground/beach mesh with simple collision representation. |
| Ocean | One bounded implementation plus a small shoreline treatment. |
| Architecture | One facade kit adapted into studio, workshop, and arcade shells. |
| Shoreline rocks | Three reusable rock variants. |
| Navigation surfaces | One ramp, a short wall segment, and a simple sign mount. |
| Hero identity | One exact-artwork WestCose sign/landmark. |
| Interactions | One project display, one contact fixture, one arcade cabinet. |
| Small detail | One bench/driftwood grouping and a very limited utility/sticker set. |

These are asset families, not requirements for separate downloads or draw calls. Reuse shared resources and follow the architecture plan's scene budgets. Do not produce dozens of unique decorative objects before finishing one useful corner.

Use the actual repository structure where present. Suggested locations are:

```text
docs/world/STYLE.md                    # This guide
art-source/world/dead-coast/            # Editable art, source scenes, approved references
public/world/models/dead-coast/         # Runtime model exports only
public/world/textures/dead-coast/       # Runtime materials and artwork textures
src/features/world/data/               # Layout, hotspots, and quality definitions
```

Create directories only when used. Keep `.blend` files, large source artwork, and authoring renders out of public runtime assets. Record asset origins and approvals; use only supplied or appropriately licensed content.

Follow the established one-meter runtime scale, Y-up world, verified export conversion, and independent collision proxies. Inspect imported scale, normals, UVs, signs, and materials in the browser before accepting a model.

## 16. Build order and review gates

### Gate A — Playable coastline graybox

Build the courtyard, three shell volumes, simple beach, static ocean, two beach connections, capsule, and readable placeholder wayfinding. Include the existing handoff's movement, collision, camera, project interaction, pause, fallback, and return behavior.

Keep Blender optional. No finished character, ocean simulation, full interiors, or expanded game system is needed.

**Pass:** a visitor can move around the loop, recognize land and water boundaries, approach a real project, read it, close it, and continue without getting stuck.

### Gate B — One finished coastal corner

Finish only the studio corner, adjacent yard, one beach ramp, a visible shoreline segment, and the supporting water/sky. Include one exact-artwork sign, one project display, and the core material palette.

Keep the workshop and arcade as coherent placeholders. Do not finish the whole district before the style is reviewed.

**Pass:** the real browser view conveys coastal WestCose character without relying on unshipped render effects or dense decoration.

### Gate C — Repeat and connect

Apply the approved kit to the workshop and arcade. Add About and Contact in their shared spaces. Verify the actual FightClub launcher separately; a modeled cabinet is not proof that the game is playable.

Add a small amount of environmental storytelling only after every required destination works. Keep future games, additional rooms, collectibles, and scenic expansion as separate scoped additions.

## 17. Acceptance checklist

Capture and inspect these views from the running browser: spawn toward the cove; studio approach; beach looking inland; shoreline boundary; project preview open; and reduced-effects mode. Include the avatar for scale in gameplay views.

- [ ] Spawn communicates a creative coastal district, not a generic industrial asset demo.
- [ ] The ocean and beach are visible as intentional open space, not unfinished gaps.
- [ ] At least two destinations are visible from spawn; the first project is nearby.
- [ ] Buildings, doors, signs, and artwork remain readable on dark surfaces.
- [ ] The beach loop connects naturally and the camera can follow it without clipping.
- [ ] The shoreline and collision boundary agree; no required object implies swimming.
- [ ] Logos use supplied artwork without distortion, substitution, or misspelling.
- [ ] The environment works without bloom, depth of field, reflections, or continuous motion.
- [ ] Direct content navigation, contact, focus, and reduced-effects access remain intact.
- [ ] Repeated assets feel coherent rather than randomly scattered.
- [ ] Runtime transfer, triangles, draw calls, and observed frame behavior are reported against the architecture plan; fewer modeled buildings alone is not a pass.
- [ ] Remaining placeholders and unverified game functionality are explicitly identified.

**Stop and correct the foundation when:** the palette becomes uniformly dark; every wall needs noise to look interesting; the ocean requires a complicated effects stack; the beach becomes a long empty commute; or the scene looks good only from an aerial camera.

## 18. Agent handoff

Use this instruction alongside the first-playable handoff:

> Read `docs/world/STYLE.md` and the existing World architecture before editing. The selected direction is Dead Coast: a compact coastal-industrial creative district around a crescent beach, with open ocean occupying roughly half the overview composition. Use a shared kit for the studio, workshop, and arcade; put About inside the studio and Contact beside the courtyard. Preserve the existing runtime architecture, content, routes, and UI preferences. First deliver the playable graybox with a static, inexpensive ocean treatment. Then stop for functional review. The subsequent art milestone is one studio-and-shoreline corner, not the full district. Use exact supplied WestCose artwork, keep dark surfaces readable, and judge everything in the actual gameplay camera. Do not introduce spherical terrain, expensive water effects, generic asset-pack styling, new branding, or unrelated website changes.

## 19. Basis and revision notes

This guide develops the owner's selection of Dead Coast and the requested beach/ocean addition. It carries forward the supplied World architecture and Astra first-playable handoff: compact district, shared portfolio routes, readable materials, exact brand artwork, procedural-first development, and a separate finished-art milestone.

The older Labs OS and Pocket OS briefs inform the product-family relationship, not a requirement to make the outdoor world uniformly dark or recreate obsolete public controls. No current repository, final asset inventory, completed model, or in-browser performance result was inspected to create this style guide.

The cove layout, proportions, palette values, modular building consolidation, and detailed coastal treatment are new creative specifications in this document. Revise them after the first art review without silently changing the selected concept or expanding the implementation scope.

**Final rule:** let the sea provide openness, the buildings provide destinations, and the artwork provide WestCose.
