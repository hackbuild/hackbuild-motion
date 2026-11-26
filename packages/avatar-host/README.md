# @hackbuild/avatar-host

Host a character on a three.js stage in any container, with a follow camera, the presence frame order and a loop that pauses when nobody can see it.

[![npm](https://img.shields.io/npm/v/@hackbuild/avatar-host)](https://www.npmjs.com/package/@hackbuild/avatar-host) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 3.7 kB measured](https://img.shields.io/badge/gzip-3.7%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

Browser status: no real VRM, GLB or FBX file has been shown on this stage in a browser yet; the browser checks ran on the placeholder body built in code.

## What it does

- Gives you a stage in any element: a renderer sized to its container, orbit controls, plain lights or a lit scene, and a `hb-avatar-host` custom element for pages with no framework.
- Loads bodies through `@hackbuild/avatar` with ticketed loads, so a slow load that a newer one overtook is freed and never shown.
- Runs one frame order for every body: clip player, head level, pose, gaze, face with lid and mouth, then the avatar update.
- Frames the posed body with a camera that eases, holds still inside a dead zone and leaves a hand zoom alone.
- Stops the loop while the page is hidden, the stage is off screen, inactive or covered, or the 3D context is lost, and draws previews of clips and avatars in the background.

## Install

```sh
npm install @hackbuild/avatar-host @hackbuild/avatar three @pixiv/three-vrm
```

It depends on `@hackbuild/avatar`, `@hackbuild/presence`, `@hackbuild/lipsync`, `@hackbuild/environment`, `@hackbuild/organic` and `@hackbuild/rig`, which install with it. `three` is an optional peer needed by `/three` and `/thumbs`. `@pixiv/three-vrm` is needed only to show VRM files, and is imported on the first `.vrm` through the hook you pass.

| subpath | needs | pin |
|---|---|---|
| `@hackbuild/avatar-host` | nothing; the ticketed host, drop sources, the stage loop and failure copy | none |
| `@hackbuild/avatar-host/three` | `three` (optional peer), WebGL | 0.186.1 or later |
| `@hackbuild/avatar-host/thumbs` | `three`, WebGL | 0.186.1 or later |
| `@hackbuild/avatar-host/iife` | a page with a `THREE` global; leaves out three-vrm | none |

## Quick start

```ts
import { AvatarStage } from "@hackbuild/avatar-host/three";

// the stage sizes itself to its container and pauses while hidden or off screen
const box = Object.assign(document.createElement("div"), { style: "height: 70vh" });
const input = Object.assign(document.createElement("input"), { type: "file", multiple: true });
document.body.append(input, box);
const stage = new AvatarStage(box, {
  // three-vrm is imported on the first .vrm only
  vrm: () => import("@hackbuild/avatar/vrm").then((m) => m.vrmHook()),
});
stage.on("failed", (e) => console.warn(e.message));
stage.on("stats", (e) => console.log(e.stats.fps.toFixed(0), "fps"));

// the placeholder body is built in code; pick a .vrm, .glb or .fbx (and its textures) to swap it
stage.showPlaceholder().setExpression("happy", 0.5);
input.onchange = async () => {
  const body = await stage.show([...(input.files ?? [])]);
  body?.setGazeMode("listen");
};
```

## Live example

The demo page shows the placeholder or a VRM, GLB or FBX you drop, with the follow camera and the pause rules: [hackbuild-motion/avatar-host](https://hackbuild.github.io/hackbuild-motion/avatar-host/). The suite's avatar screen runs on this stage: [hackbuild-suite avatar](https://hackbuild.github.io/hackbuild-suite/#/motion/avatar).

## Concepts

### the stage and its loop

`AvatarStage(container, opts)` sizes the renderer to its container with a `ResizeObserver`, never the window, and caps the pixel ratio at 2. One `setAnimationLoop` runs the frame. It stops for each pause reason (`hidden`, `offscreen`, `inactive`, `covered`, `lost`, `paused`) and takes one fixed step of 1/60 s as the first delta after a stop. Under reduced motion it draws only while something moves: a clip, a mouth, or a finger on the camera. Tell the stage when your route is inactive or a sheet covers it:

```ts
stage.setActive(routeIsShown);
stage.setCovered(sheetOpen);
```

### ticketed loads

`stage.show(source)` resolves to the body, or to null when a later show overtook it; the overtaken body is freed and never shown. A source is a URL, a list of dropped files or a `BodySource`. Files a model references resolve by path below the model's folder, then by file name anywhere in the drop, ignoring case. `droppedFiles(dataTransfer)` walks dropped folders and keeps each file's relative path.

### the frame order

Each frame the presence `ClipPlayer` writes every bone, `HeadLevel` lifts a head a clip holds low, the pose goes onto the bones, gaze goes onto neck, head and eyes, the presence `Face` writes every expression weight (mood, clip face tracks, the lid, `LipSync` mouth shapes), and then `avatar.update(dt)` runs. With no idle clip the base is the rest stance with the arms down. Gaze turns on by itself when the head rests upright and facing +Z.

```ts
const body = stage.showPlaceholder();
body.play(waveClip, { layer: "upper" });
body.lip.push(speechEvents); // timed words or visemes from a speech engine
```

### the follow camera

The camera target eases after the body's centre plus your pan, holds still while the body moves less than 6 percent of its height, pulls back on the first frame a pose outgrows the view and comes closer only once 12 percent too far. A zoom the person picked is left alone. `stage.setFollow(false)` stops following.

### lit scenes

`stage.showEnvironment("studio")` puts a scene from `@hackbuild/environment` around the body, imported on first use. Requests are ticketed like bodies; a missing file emits `failed` and keeps the current scene. The studio needs no file; other presets take a `resolve` for their files. While a scene shows, the shadow map is on and the pixel ratio caps at 1.5.

### the custom element

`defineAvatarHost(tag?, opts?)` defines `hb-avatar-host` with the attributes `src`, `environment`, `paused`, `inactive` and `covered`. Stage events arrive as DOM events of the same name with the stage event as `detail`. Nothing is defined on import.

### previews in the background

`clipThumbs({ save })` poses one clay figure at each clip's most telling frame into a 192 px square, and `avatarThumbs({ save })` draws each body at rest at 240 by 320 px. Both run one item at a time on one renderer, urgent items first, each item tried once per session, with a rest between items as long as the last render.

## API overview

| export | what it does |
|---|---|
| [`AvatarStage`](../../docs/api/avatar-host/three.md#avatarstage) | the stage: renderer, camera, loop, environment and the body it shows |
| [`Body`](../../docs/api/avatar-host/three.md#body) | a shown character driven in the presence frame order |
| [`FollowCamera`](../../docs/api/avatar-host/three.md#followcamera) | keeps the posed body framed |
| [`EnvironmentSlot`](../../docs/api/avatar-host/three.md#environmentslot) | one lit scene at a time, ticketed |
| [`defineAvatarHost`](../../docs/api/avatar-host/three.md#defineavatarhost) | define the `hb-avatar-host` element |
| [`placeholderBody`](../../docs/api/avatar-host/three.md#placeholderbody) | a mannequin built in code, no asset file |
| [`loadBody`](../../docs/api/avatar-host/three.md#loadbody) | load a body source through `@hackbuild/avatar` |
| [`StageEvent`](../../docs/api/avatar-host/three.md#stageevent) | loaded, failed, stats, state, lost and restored |
| [`AvatarHost`](../../docs/api/avatar-host/index.md#avatarhost) | ticketed loads through adapters, with no three.js |
| [`StageLoop`](../../docs/api/avatar-host/index.md#stageloop) | the loop and its pause reasons |
| [`sourceFromFiles`](../../docs/api/avatar-host/index.md#sourcefromfiles) | the model of a drop and a resolver for its files |
| [`droppedFiles`](../../docs/api/avatar-host/index.md#droppedfiles) | walk a drop's folders, keeping relative paths |
| [`bodyError`](../../docs/api/avatar-host/index.md#bodyerror) | a line for the person from a load failure |
| [`clipThumbs`](../../docs/api/avatar-host/thumbs.md#clipthumbs) | clip previews on a clay figure |
| [`avatarThumbs`](../../docs/api/avatar-host/thumbs.md#avatarthumbs) | avatar previews at rest |

The full reference is in [docs/api/avatar-host](../../docs/api/avatar-host/README.md).

## Models and weights

No models ship with this package. The placeholder body is built in code. Any other body is a URL or a file you give, loaded through `@hackbuild/avatar`, and keeps its own licence; for a VRM, `@hackbuild/avatar` reads it from the file's metadata.

| source | id | size | licence | loads from |
|---|---|---|---|---|
| placeholder body | `placeholderBody()` | built in code, head top near 1.74 m (computed) | MIT, part of this package | code |
| a VRM, GLB, glTF or FBX you give | none | unknown | the file's own; VRM metadata when present | the URL or files you pass |
| studio scene | `studio` | built in code | MIT | code |
| room, cafe and outdoors scenes | preset ids | unknown | the files' own | the files your `resolve` gives |

## Browser support

| part | needs | Chrome | Safari | Firefox | phone |
|---|---|---|---|---|---|
| main entry | ES2022 | yes (measured in tests) | yes (inferred) | yes (inferred) | yes (inferred) |
| stage, body, camera | WebGL, `ResizeObserver`, `IntersectionObserver` | yes (measured, headless) | unknown | unknown | unknown |
| previews | WebGL | unknown | unknown | unknown | unknown |
| single file build | a classic script, rig wasm inlined, file:// included | yes (inferred) | unknown | unknown | unknown |

Without WebGL the stage cannot start, and the `failed` event carries `no webgl here. the 3d view cannot start on this device.` A lost 3D context shows a button with `LOST_COPY` and restores on a press.

## Errors and troubleshooting

Load failures do not throw from `show`: the stage emits `failed` with a line for the person (from `bodyError`) and the raw error as `cause`. These are thrown:

| message | cause | what to do |
|---|---|---|
| `this file is a pmx. open it with the mmd loader of the avatar package.` | `sourceFromFiles` got a PMX or PMD | load it with `loadMmd` from `@hackbuild/avatar/mmd`, then `stage.showAvatar` |
| `a <ext> file is an animation. drop a body: a .vrm, .glb, .gltf or .fbx.` | the drop held only a clip file | drop a model file |
| `this drop has no model. drop a .vrm, .glb, .gltf or .fbx file.` | no model file in the drop | drop a model file |
| `no adapter for <kind> files.` | `AvatarHost.show` got a kind with no adapter | add an adapter for that kind |
| `this clip has <n> bones and the body <m>. build it with clipOf or over body.names.` | `body.play` got a clip built over another bone list | build the clip with `body.clipOf` |
| `the clip moves no bone of this figure.` | a clip preview had no track for the figure's bones | check the clip's bone names; it reaches `failed(id, reason)` |

The `failed` event lines include `this model has no humanoid rig the stage can map. missing bones: <bones>.`, `the model did not download (http <status>). check the url.` and `the model did not load. its file may be damaged or of a kind the stage does not read.`

### mistakes to avoid

- Sizing the canvas to the window or calling `renderer.setSize` yourself: the stage follows its container.
- Leaving the loop running under a sheet or on a hidden route: call `setCovered` and `setActive`, or set the `covered` and `inactive` attributes.
- Writing bones or expression weights outside the body's frame order: use `body.play`, `body.setExpression` and `body.lip` so one owner writes each channel.
- Showing a VRM without the `vrm` hook in the stage options: it loads as plain glTF with no expressions or spring bones.
- Forgetting `stage.dispose()` when the stage leaves the page: it frees the body and the WebGL context.

## Works with

- [@hackbuild/avatar](../avatar/README.md) loads and repairs the bodies the stage shows.
- [@hackbuild/presence](../presence/README.md) gives the clip player, gaze and face of the frame order.
- [@hackbuild/lipsync](../lipsync/README.md) turns speech timing into the mouth shapes behind `body.lip`.
- [@hackbuild/environment](../environment/README.md) builds the lit scenes of `showEnvironment`.
- [@hackbuild/motion-views](../motion-views/README.md) wraps this stage as the character stage view for Vue and custom elements.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. No models ship here; each body you load keeps its own licence. `@pixiv/three-vrm` is MIT.

## What is verified, and what is not

| check | result |
|---|---|
| `npx vitest run packages/avatar-host` | 42 of 42 tests pass (counted) |
| ticketed host | two overlapping shows resolve null for the first and never show it; a failed create is retried; `exclusive` destroys the other runtime; `release` runs once when a load wins, loses or throws |
| drop sources | path then name lookup in another case, and a miss; a nested folder walk keeps relative paths |
| stage loop | 0 frames while hidden; one fixed step after a pause of 89 s; draw on change only under reduced motion |
| follow camera | still under the dead zone; pulls back on the first frame; closer only past the slack; a hand zoom is left alone |
| body | the placeholder stands in the normalized space; a clip plays over rest and hands back to the rest stance; gaze turns the head toward a target; a held mood reaches 0.63 in 1/8 s (computed) |
| a GLB built in the test | loads through the host into the normalized space and is freed on dispose |
| environment slot | an overtaken scene load is disposed and never attached; the same id loads once; a failed load keeps the scene; the pixel ratio caps at 1.5 with a scene |
| previews, with a stand in renderer | urgent items jump the queue; each item is tried once; the renderer is freed 20 s after the queue empties; a lost context rebuilds; the rest after a 250 ms render is 250 ms; the telling frame of a wave lands within half a sample of 0.6 s (computed) |
| headless Chrome, the demo page | 0 frames in 1 s with the page hidden (simulated); canvas 320 css px in a 320 px host; 24 geometries before and after two swaps; a lost context showed the restore line and came back; 60 fps with a wave on the placeholder (measured) |
| headless Chrome, studio scene | shadow map on with 24 meshes casting, 49 draw calls against 24 plain, plain lights back after it (measured); a shadow falls beside the body in the screenshot |

Not verified by anything:

- No real VRM, GLB or FBX file has been shown on this stage in a browser. The VRM eye path through three-vrm's look at is unchecked.
- Gaze stays off on a model whose head does not rest upright; such a body gets clips, mouth and camera only.
- A real tab switch, a real GPU reset, a pixel ratio 2 screen and reduced motion have not been run in a browser; the pixel ratio cap was measured at a device ratio of 1 only.
- Nobody has looked at the follow camera or gaze at frame rate on a loaded model, or the face driver on a real face.
- The room, cafe and outdoors scenes have not been shown on this stage; their files are not in the repository.
- No preview has been drawn in a browser: `ClipPortrait` and `AvatarPortrait` need WebGL and have not rendered an image yet.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 3,700 bytes | 3,885 bytes |
| `dist/avatar-host.iife.js` (single file build) | 195,992 bytes | 205,791 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.
