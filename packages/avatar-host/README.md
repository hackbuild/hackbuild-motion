# @hackbuild/avatar-host

Hosts a character on a three.js stage in any container. Bodies load
through `@hackbuild/avatar` into the normalized humanoid space (VRM 1.0
bone names, T pose, +Z forward, meters, feet at y = 0), the camera frames
and follows the posed body, and the frame loop follows the stage rules of
the suite: one `setAnimationLoop`, stopped when the page is hidden, the
host is off screen or at zero size, the route is inactive or a sheet
covers it. Framework free, with an `hb-avatar-host` custom element for
vanilla pages and for the slot of a Vue stage part.

The main entry has no three.js:

- `AvatarHost`: ticketed loads. `show(source)` resolves to the result, or
  to null when a later show superseded it; a superseded result is
  discarded and never shown. One runtime per adapter key, made on first
  use (the import for a format happens once); a failed create is
  forgotten so the next show tries again; `exclusive` destroys the other
  runtimes on a switch; a source's `release` runs once whether its load
  wins, loses or throws.
- `sourceFromFiles(files)`: the first `.vrm`, `.glb`, `.gltf` or `.fbx` of
  a drop, with a resolver that finds referenced files by path below the
  model's folder, then by file name anywhere in the drop, ignoring case.
  Misses are listed; object URLs are freed by `release`. A `.pmx` drop
  reads "this file is a pmx. open it with the mmd loader of the avatar package."
- `droppedFiles(dataTransfer)`: walks dropped folders and keeps each
  file's relative path.
- `StageLoop`: the pause reasons (`hidden`, `offscreen`, `inactive`,
  `covered`, `lost`, `paused`), one fixed step (1/60 s, proposed) as the
  first delta after any stop, and draw on change only under reduced
  motion, while a clip, a mouth or a finger on the camera still runs it.
- `bodyError(e)`: copy for the person from a load failure ("this model has
  no humanoid rig the stage can map. missing bones: hips.").

`/three`:

- `AvatarStage(container, opts)`: renderer sized to its container by a
  `ResizeObserver` (never the window), pixel ratio capped at 2 (proposed),
  an `IntersectionObserver` and `visibilitychange` for the pause rules,
  orbit controls (one finger orbits, two pinch and pan), plain lights.
  `show`, `showPlaceholder`, `showAvatar`; `play`, `pause`, `setActive`,
  `setCovered`; `zoomBy`, `resetView`, `lookAtView`, `resize`, `snapshot`
  (one frame stepped, rendered and read in the same task, so no
  `preserveDrawingBuffer`); `dispose` frees the body, calls
  `renderer.dispose()` and loses the context. A lost context shows a
  button with "the 3d view was lost. press to restore." Events through
  `on(type, fn)`: `loaded` (the body and its capability list), `failed`
  (copy and cause), `stats` (fps from the loop clock, draw calls,
  triangles, buffer size, pixel ratio), `state`, `lost`, `restored`.
- `EnvironmentSlot` as `stage.environment`, and `stage.showEnvironment(id
  | { preset, resolve } | null)`: a lit scene from `@hackbuild/environment`
  around the body, imported on first use. Requests are ticketed: a slow
  load a newer one overtook is disposed and never attached; the same id
  again does nothing. The swap disposes the old scene first, turns on the
  shadow map with the body casting, hides the plain lights and caps the
  pixel ratio at 1.5 (vendor) while a scene shows. A missing file emits
  `failed` with the environment copy and keeps the current scene. The
  studio needs no file; the element takes it as the `environment`
  attribute.
- `Body`: the body surface and the frame order. Each frame the presence
  `ClipPlayer` writes every bone (an idle of the rest pose, a body layer
  and an upper layer), `HeadLevel` lifts a low clip head, `applyPose`,
  `GazeController` through `applyGaze`, then the presence `Face` writes
  every expression weight in one pass (moods eased, clip face tracks, the
  gaze controller's lid, `LipSync` mouth shapes through `drive` on
  `face.mouth`), then `avatar.update(dt)`. With no idle clip the base
  layer is the rest stance, arms relaxed at the sides (`stance: "rest"`
  keeps the loaded pose); a quiet face rests at a slight smile
  (`restingFace: false` for neutral). `play(clip | animation | name)`,
  `stop`, `clipOf`, `setExpression`, `setGazeMode`, `setPartVisible`,
  `lip` for speech events. Gaze turns on by itself when the head rests
  upright and facing +Z (VRM bodies and the placeholder); for VRM the eyes
  go through three-vrm's look at.
- `FollowCamera`: the target eases after the body's centre plus the
  person's pan, with a dead zone of 6 percent of the body's height; the
  distance eases to fit the pose, pulls back from the first frame a pose
  outgrows the view and comes closer only once 12 percent too far; a hand
  zoom is left alone (rate 3, dead zone 0.06, slack 0.12, margin 1.12,
  vendor, all options). `follow: { follow: false }` in the stage options,
  or `stage.setFollow(false)` at any time, turns following off; the
  camera then moves only by hand or `resetView`.
- `loadBody` and `bodyAdapters`: the scene level loader. A dropped
  model's references go through the source's resolver, and the load waits
  for every texture the loader started before it resolves. The rig wasm
  loads once, on the first body.
- `placeholderBody()`: a mannequin of capsules on a humanoid skeleton,
  built in code, head top near 1.74 m (computed). No asset file.
- `/thumbs`: previews drawn in the background. `clipThumbs({ save })`
  poses one clay figure (the placeholder body, or a figure you pass) at
  each clip's most telling frame, the sampled frame between 10 and 90
  percent of the clip furthest from rest by the limbs and trunk
  (`tellingTime`), into a 192 px square. `avatarThumbs({ save })` loads
  each body source and draws it at rest, 240 by 320 px. Both run on
  `ThumbQueue`: one item at a time on one renderer, urgent items first,
  each item tried once per session, a rest between items as long as the
  last render within 40 to 400 ms, one task yield instead in a hidden tab,
  a lost context rebuilds the renderer, and the renderer lingers 20 s after
  the queue empties (vendor figures, all options). `save(id, blob)` gets a
  PNG Blob; `failed(id, reason)` names why an item gave none.
- `defineAvatarHost(tag?, opts?)`: defines `hb-avatar-host`. Attributes
  `src` (a model URL; the placeholder shows without one), `environment`
  (a scene id), `paused`,
  `inactive`, `covered`. Stage events arrive as DOM events of the same
  name with the stage event as `detail`. Nothing is defined on import.

Every random draw comes from an injected `Rng` (default
`seededRng("avatar-host")`); the package reads no wall clock.

## Install

Not published yet. From a clone:

    npm ci && npm run build

## Use

```ts
import { defineAvatarHost } from "@hackbuild/avatar-host/three";
import { droppedFiles } from "@hackbuild/avatar-host";

defineAvatarHost("hb-avatar-host", {
  // three-vrm (MIT) is imported on the first .vrm only
  vrm: () => import("@hackbuild/avatar/vrm").then((m) => m.vrmHook()),
});
const el = document.querySelector("hb-avatar-host")!;
el.addEventListener("loaded", (e) => console.info(e.detail.caps));
el.addEventListener("failed", (e) => showError(e.detail.message));
zone.addEventListener("drop", async (e) => el.showFiles(await droppedFiles(e.dataTransfer!)));
```

Or without the element:

```ts
import { AvatarStage } from "@hackbuild/avatar-host/three";

const stage = new AvatarStage(container, { background: 0xf5f0e6 });
stage.on("stats", (e) => hud(e.stats.fps));
const body = (await stage.show("https://example.org/body.glb")) ?? stage.showPlaceholder();
body.play(body.clipOf(body.avatar.animations[0]!)!, { loop: true });
body.lip.push(speechEvents);
stage.setCovered(sheetOpen);
stage.dispose();
```

`dist/avatar-host.iife.js` is the single file build (`HackbuildAvatarHost`,
the rig wasm inlined, `THREE` read from the page). It leaves out three-vrm;
a page that wants VRM passes a hook.

## Develop

    npm run build -w @hackbuild/avatar -w @hackbuild/avatar-host
    npx vitest run packages/avatar-host

The example page `examples/avatar-host` runs the browser rows with `?auto`.

## What is verified, and what is not

### Verified on this machine

- 2026-11-24: `npx vitest run packages/avatar-host` passed 41 of 41
  tests (counted), 8 of them in `test/thumbs.test.ts` with a stand in
  renderer and fake timers: an urgent request jumps the queue, waiting
  items included; an item is tried once; the renderer is disposed 20 s
  after the queue empties and rebuilt for a later request; a failed render
  reports its reason and the next item still draws; a lost context
  rebuilds; the rest after a 250 ms render is 250 ms; a renderer that
  cannot be built fails every waiting item with its reason; the telling
  frame of a wave on the placeholder lands within half a sample of the
  peak at 0.6 s (computed).

- 2026-11-24: `npx vitest run packages/avatar-host` passed 33 of 33
  tests (counted), with the face driver and rest stance: a played clip
  hands back to the rest stance with the hand below the shoulder;
  `stance: "rest"` keeps the loaded pose; a held mood reaches 0.63 in
  1/8 s and the lid and mouth go through the face.
- 2026-11-24: `npx vitest run packages/avatar-host` passed 31 of 31
  tests (counted), with the environment slot: a slow scene load
  overtaken by a newer one is disposed and never attached; the same id
  loads once, a failed load keeps the scene, null clears it; the pixel
  ratio caps at 1.5 with a scene.
- 2026-11-24, headless Chrome on the example page: the studio scene under
  the placeholder turns on the shadow map with 24 meshes casting and the
  ground taking it, 49 draw calls against 24 plain, and the plain lights
  come back after it (measured). The screenshot was looked at by the
  builder: a shadow falls on the ground beside the body.
- 2026-11-24: `npx vitest run packages/avatar-host` passed 28 of 28
  tests (counted): two overlapping shows resolve null for the first and
  never show it; a failed create is retried on the next show; `exclusive`
  destroys the other runtime; `release` runs once when a load wins, loses
  or throws; the two step texture lookup by path, then by name in another
  case, and a miss; a nested folder walk keeps relative paths; the loop
  draws 0 frames while hidden, takes one fixed step after a pause of 89 s,
  and draws on change only under reduced motion; the follow camera stays
  still under the dead zone, pulls back on the first frame, comes closer
  only past the slack and leaves a hand zoom alone; the placeholder stands
  in the normalized space; a clip plays over rest and hands back; gaze
  turns the head toward a target on the left; a generated GLB loads
  through the host into the normalized space and is freed on dispose.
- 2026-11-24, headless Chrome on the example page: 0 frames drawn in 1 s
  with the page hidden (hidden simulated by overriding `document.hidden`),
  the canvas 320 css px in a 320 px host, 24 geometries before and after
  two swaps, a superseded show resolved null, a lost context showed the
  restore line and came back on a press, 60 fps with a wave playing on the
  placeholder (measured).

### Not verified by anything

- No real VRM, GLB or FBX file has been shown on this stage in a browser.
  The VRM eye path through three-vrm's look at (yaw and pitch signs) is
  unchecked.
- Gaze on a model whose head does not rest upright is left off; such a
  body gets clips, mouth and camera only.
- A real tab switch, a real GPU reset, a pixel ratio 2 screen and reduced
  motion in a browser have not been run.
- Nobody has looked at the follow camera or gaze at frame rate on a
  loaded model.
- The room, cafe and outdoors scenes have not been shown on this stage;
  their files are not in the repository. The pixel ratio cap was measured
  at a device ratio of 1 only.
- No thumbnail has been drawn in a browser: `ClipPortrait` and
  `AvatarPortrait` need WebGL and have not rendered an image yet. The
  face
  driver has not run on a real face in a browser.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 3,700 bytes | 3,885 bytes |
| `dist/avatar-host.iife.js` (single file build) | 195,992 bytes | 205,791 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

## Licence

Code MIT (`LICENSE` in this package and at the repository root). This
README is CC-BY-4.0, its code samples also MIT.
