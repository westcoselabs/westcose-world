# Mountain revision 3 — approval only

The single-cove proposal is approved. Its outline is carried into this package,
but neither it nor the mountain proposal has been implemented in the live world.

Updated from the user's September 13 mountain reference: the lodge and ticket
booth sit together at the foot of central F, just downhill of its lower finish.
The three approved run geometries are unchanged. Numbering follows the reference:
1 central, 2 east, 3 west. `approval-v1.html` preserves the previous drawing.

## Proposed changes

- Keep the radius-36 globe, summit chart location [0,153], and rear shoreline.
- Increase summit height from 32 m to 40 m above the base sphere, a 25% increase.
- Extend the alpine mountain foot and snow area to approximately z60–70 instead
  of only the short upper mountain. The alpine/forest transition begins around z55.
- Group the lodge and ticket hut at one compact base cluster around [1,54], just
  downhill of central F's finish, with approximately 3 m clear building spacing.
- Route 1 makes a broad central S sweep; route 2 follows the eastern outer contour;
  route 3 makes more frequent rounded turns along the western forest edge.
- Keep all three existing routes unchanged, with separate finishing lanes around z65.
- A pedestrian path reaches the shared base forecourt and lodge/ticket cluster.
- Provide three broad, separate runs on a shared larger snowy mountain—not three
  raised ribbons. Widths are 6.5 m central, 8 m east and 7 m west, in physical surface metres.
- Provide a small 6×6 m summit spawn pad and a 32 m-wide gentle decision shoulder.
- Keep three separate finish lanes before one shared slow-down/recovery apron.

The exact drawing-only coordinates and scalar height field live in
`proposal-data.mjs`. This module is never imported by the application.

## Future snowboard minigame, not implemented

1. Walk to the ticket booth and start the game.
2. Transfer to the summit spawn; route choice occurs before the timer starts.
3. Choose one of three distinct route gates.
4. Ride to the lower finish; route checks and speed/camera tuning come later.
5. Slow down in the run-out and choose retry, another route, or ordinary exploration.

No snowboard controls, physics, scoring, checkpoints, teleport or UI are built in
this approval pass. The ticket booth is a future interaction location only.

## Important tiny-planet constraint

The lower finish at z65 is about 140° around the globe from the summit at z153.
The solid globe hides the summit from that lower finish. The compact lodge/ticket
cluster sits just downhill of central F at the base. Exterior globe pictures retain
the real curvature; they are not ground-camera visibility promises.

The unwrapped terrain preview shows the complete run arrangement for approval,
not what one real in-game camera can see. The separate globe previews retain the
actual spherical projection. The summit remains the same mountain across the sea
from the pier; preserving its rear falloff is part of the proposal.

The minigame starts at the base ticket booth and transfers to the summit; no change
to the globe projection or size is silently substituted here.

## Reading the drawings

- `mountain-plan`: top view with proposed run corridors and the old base/snow line.
- `resort-closeup`: base lodge/ticket spacing and the shared forecourt.
- `mountain-elevation`: unwrapped longitudinal height section, not a globe camera.
- `whole-world`: current untouched town/forest approach and approved cove context,
  with the expanded mountain overlaid as a proposal.
- `preview-3d` / rendered approval pictures: isolated blockout, not live-game art.

The top-view drawings use authored x/z coordinates and independent display scales
for clarity. Width annotations are physical widths, and run lengths are measured
from densely sampled curved 3D centerlines. These are not gameplay durations.
The building gap is measured in the terrace tangent-plane metric.

## Verification / scope

`validation.json` records exact current/proposed run lengths, responsive layout
checks and the before/after world-source fingerprint. Preview-generation scripts
write only design artifacts and their own scripts, never application source.
This revision changes only the approval-map base cluster; the approved cove and
the three run geometries are unchanged. The earlier approved cove files are preserved.

Future implementation will require raising the current 39 m terrain/support height
limit for the 40 m summit, expanding the snow mask, relocating the base platform and
testing walking/camera/performance. None of these live changes is made here.
