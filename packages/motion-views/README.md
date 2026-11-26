# @hackbuild/motion-views

Put a character stage, an avatar drop card and a clip strip on your page, drawn with the hackbuild-ui stylesheet, as custom elements or Vue components.

[![npm](https://img.shields.io/npm/v/@hackbuild/motion-views)](https://www.npmjs.com/package/@hackbuild/motion-views) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 3.3 kB measured](https://img.shields.io/badge/gzip-3.3%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

## What it does

- `CharacterStage`: a body on a lit stage with idle, gaze, blinks and lips, a corner plate, turn around and framing tools, a verb row and an inset slot. It speaks real audio with word timings, or text alone on estimated timings.
- `AvatarDrop`: a drop zone and pick button that loads a VRM, GLB or FBX once, checks its rig in plain words, draws a still and shows the avatar card.
- `ClipStrip`: each clip's still, name and length, the picked one pressed and one play button.
- Ships every view as a mount function, a custom element and a Vue 3 component, on one code path.
- Carries no styles of its own; every class is hackbuild-ui's.

## Install

```sh
npm install @hackbuild/motion-views three @virgilvox/hackbuild-ui
```

`@virgilvox/hackbuild-ui` 0.10 is a required peer, and the page loads its stylesheet (`@virgilvox/hackbuild-ui/styles.css`). three.js is needed by the views; Vue only by `/vue`. It depends on `@hackbuild/avatar`, `@hackbuild/avatar-host`, `@hackbuild/presence`, `@hackbuild/lipsync` and `@hackbuild/organic`, which install with it.

| subpath | needs | pin |
|---|---|---|
| `@hackbuild/motion-views` | nothing; the words, clip items and speech timings | none |
| `@hackbuild/motion-views/vanilla` | `three` (optional peer), `@virgilvox/hackbuild-ui` (peer) | three 0.186.1 or later, hackbuild-ui `>=0.10.0 <0.11.0` |
| `@hackbuild/motion-views/vue` | `vue` (optional peer) and the above | vue 3.5.0 or later |
| `@hackbuild/motion-views/iife` | `THREE` on the page | one classic script |

## Quick start

```ts
import { avatarDrop, characterStage } from "@hackbuild/motion-views/vanilla";

// the stage shows a placeholder body built in code until you give it one
const host = document.createElement("div");
host.style.height = "480px";
document.body.append(host);
const stage = characterStage(host, { name: "stand-in", hello: "hello. drop a vrm, glb or fbx on me." });
stage.on((e) => e.type === "doing" && console.log("doing", e.word));

// a drop card: press the card of a checked avatar to put it on the stage
const card = document.body.appendChild(document.createElement("div"));
avatarDrop(card).on((e) => {
  if (e.type === "checked") console.log(e.report.check.head, e.report.size);
  if (e.type === "use") void stage.show(e.files);
});

// text alone moves the lips on estimated word timings, with no sound
await stage.say("you can drop a model on me");
stage.gesture("wave");
```

## Live example

The demo pages run each view on the placeholder body built in code: [character stage](https://hackbuild.github.io/hackbuild-motion/character-stage/), [avatar drop](https://hackbuild.github.io/hackbuild-motion/avatar-drop/) and [clip strip](https://hackbuild.github.io/hackbuild-motion/clip-strip/). The package page is [hackbuild-motion/motion-views](https://hackbuild.github.io/hackbuild-motion/motion-views/), and the suite's character screen runs on it: [hackbuild-suite character](https://hackbuild.github.io/hackbuild-suite/#/character).

## Concepts

### one view, three ways to mount it

`characterStage(host, opts)`, `avatarDrop(host, opts)` and `clipStrip(host, opts)` mount into an element and return a handle with `on(fn)` and `dispose()`. `defineMotionViews(opts)` defines `hb-character-stage`, `hb-avatar-drop` and `hb-clip-strip`, which dispatch the view's events as DOM events with the event as `detail` and keep the handle on `.handle`; importing defines nothing. The Vue components take the same options as props and emit the same events by type.

```ts
defineMotionViews({ stage: { vrm: () => import("@hackbuild/avatar/vrm").then((m) => m.vrmHook()) } });
const stage = document.querySelector<CharacterStageElement>("hb-character-stage")!;
document.querySelector("hb-avatar-drop")!.addEventListener("picked", (e) => stage.handle?.show((e as CustomEvent).detail.files));
```

### speech on the stage

`say(speech)` plays an AudioBuffer or an audio element through an analyser whose level and bands open the mouth, with the word or phoneme timings a speech engine reports. Text alone moves the lips on estimated word timings with no sound. `speechSource` says where the last timings came from. `gesture("wave" | "nod" | "shake" | "bow")` plays a gesture written in code over the body's own bones, and `play(clip)` plays a presence clip or a three.js AnimationClip.

### the rig check in plain words

`rigCheck(facts)` turns what a loaded body can do into a headline ("ready to act", "ready, with limits", "cannot act") and lines worst first, such as "no mouth shapes. the lips stay still while it talks." `sizeLine` and `licenceLine` give the card's other lines; the licence is the one the file states.

### clip items from any source

`clipsFromPack` (a `@hackbuild/bake` pack and report, with a warning on a loop that does not close), `clipFromFindings` (a `@hackbuild/retarget` motion) and `clipsFromBody` all give one `ClipItem` shape for the strip. They read structural types, so the main entry needs neither wasm package.

### hackbuild-ui classes only

The stage writes a `.hb-lay-stage`, the card is `.hb-avcard`, the strip `.hb-clipstrip`. A view adds no style of its own, so it looks like the rest of a page that loads the hackbuild-ui stylesheet.

## API overview

| export | what it does |
|---|---|
| [`characterStage`](../../docs/api/motion-views/vanilla.md#characterstage) | mount the character stage |
| [`CharacterStageHandle`](../../docs/api/motion-views/vanilla.md#characterstagehandle) | show a body, say, gesture, play, frame and listen |
| [`avatarDrop`](../../docs/api/motion-views/vanilla.md#avatardrop) | mount the drop zone and avatar card |
| [`AvatarReport`](../../docs/api/motion-views/vanilla.md#avatarreport) | what the drop learned about an avatar |
| [`clipStrip`](../../docs/api/motion-views/vanilla.md#clipstrip) | mount the clip strip |
| [`defineMotionViews`](../../docs/api/motion-views/vanilla.md#definemotionviews) | define the three custom elements |
| [`gestureClip`](../../docs/api/motion-views/vanilla.md#gestureclip) | a gesture written in code as a clip |
| [`threeStage`](../../docs/api/motion-views/vanilla.md#threestage) | a lit stage that fills an element, ticks and frees itself |
| [`meshTurntable`](../../docs/api/motion-views/vanilla.md#meshturntable) | one object on a stage you drag to turn, for a relief or a surface |
| [`stageOrbit`](../../docs/api/motion-views/vanilla.md#stageorbit) | drag to turn a camera round a target, the wheel moves in and out |
| [`boxDog`](../../docs/api/motion-views/vanilla.md#boxdog) | a dog of bones and boxes with the bone names in `BOX_DOG_BONES` |
| [`walkBvh`](../../docs/api/motion-views/vanilla.md#walkbvh) | a walk loop as bvh text for another rig, to retarget |
| [`freeMeshes`](../../docs/api/motion-views/vanilla.md#freemeshes) | free the geometry and materials under an object |
| [`CharacterStage`](../../docs/api/motion-views/vue.md#characterstage) | the stage as a Vue component |
| [`AvatarDrop`](../../docs/api/motion-views/vue.md#avatardrop) | the drop card as a Vue component |
| [`ClipStrip`](../../docs/api/motion-views/vue.md#clipstrip) | the strip as a Vue component |
| [`rigCheck`](../../docs/api/motion-views/index.md#rigcheck) | what a body can do, in plain words |
| [`sizeLine`](../../docs/api/motion-views/index.md#sizeline) | the size line of the avatar card |
| [`clipsFromPack`](../../docs/api/motion-views/index.md#clipsfrompack) | clip items from a baked pack |
| [`speechEvents`](../../docs/api/motion-views/index.md#speechevents) | what a speech becomes on the mouth clock |

The full reference is in [docs/api/motion-views](../../docs/api/motion-views/README.md).

## Browser support

| feature | needs | notes |
|---|---|---|
| main entry | any JavaScript runtime | no DOM, no three.js, runs in Node |
| the views | WebGL through three.js, custom elements | the stage pauses while hidden or off screen |
| real speech | Web Audio | an AudioContext is made on the first audio unless you pass `audioContext` |
| avatar stills | WebGL | `report.thumb` is null with no WebGL |
| single file build | `dist/motion-views.iife.js` | the vanilla entry as one classic script, `THREE` read from the page, runs from file:// |

The views ran in headless Chrome on macOS; Safari, Firefox and phones are unknown.

## Errors and troubleshooting

The views throw nothing to your code; a failure becomes an event and a plain line on screen.

| message | cause | what to do |
|---|---|---|
| a `failed` event from CharacterStage | the body could not load from the URL or files | read `e.message`; give the model with its textures, or a VRM, GLB or FBX |
| a `failed` event from AvatarDrop | the dropped files held no body it could read | drop a .vrm, .glb, .gltf with its .bin and textures, or .fbx |
| `-1` from `play` | the clip cannot play on this body | check the body has the bones the clip moves |
| `false` from `gesture` | the body lacks the bones the gesture needs | check the rig check lines of the body |

## Works with

- [@hackbuild/avatar-host](../avatar-host/README.md) is the stage under CharacterStage and draws the clip stills.
- [@hackbuild/avatar](../avatar/README.md) loads the VRM, GLB and FBX files.
- [@hackbuild/presence](../presence/README.md) and [@hackbuild/lipsync](../lipsync/README.md) give idle, gaze, blinks and lips.
- [@hackbuild/bake](../bake/README.md) and [@hackbuild/retarget](../retarget/README.md) make the clips the strip lists.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. No model or weight file ships here; an avatar keeps the licence its file states, which the card shows.

## What is verified, and what is not

### Verified on this machine

| check | result |
|---|---|
| `node tools/smoke-views.mjs` in headless Chrome on macOS 12 | pass |
| the stand-in shows and a frame is drawn | pass |
| the full body shot stands further back than the bust | 2.78 m to 4.03 m (measured) |
| say hello plays audio written in code with word timings and the level reaches the lips | peak 0.215 (measured) |
| audio with no timings moves the lips by level; text alone falls back to estimated timings; quiet when the audio ends | pass |
| wave plays on the upper body; turn around turns the body half a circle | pass |
| the stand-in written as a .glb loads, maps 24 bones, gets a still and reads "no licence in the file" | pass (measured) |
| a text file is refused in plain words | pass |
| a bvh walk retargets onto the stand-in; six clips bake into one pack and read back; a loop cut short is flagged at its seam | pass |
| the three demo pages at 1440 and 390 px against the suite's screen gate | pass |
| unit tests over the words and the clip items | pass |

### Not verified by anything

- Speech from a real speech engine; the smoke's voice is a hum written in code with word timings in an engine's shape.
- A real VRM, GLB or FBX avatar with a face; the smoke uses the stand-in built in code, which has no mouth or blink shapes.
- The Vue components in a running Vue app; they typecheck, and no page mounts them yet.
- Frame rate on a real GPU, since the smoke runs headless.
- AvatarDrop loads the file once and the stage loads it again, so a large file is read twice.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 3,266 bytes | 3,429 bytes |
| `dist/motion-views.iife.js` (single file build) | 215,543 bytes | 226,320 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.
