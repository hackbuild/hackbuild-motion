# @hackbuild/motion-views

The motion views of the hack.build libraries: `CharacterStage`,
`AvatarDrop` and `ClipStrip`. Each binds the motion packages to the
hackbuild-ui class layer and ships twice, as a Vue component and as a
custom element, so a Vue app and a plain HTML page use the same view. The
views carry no styles of their own; every class is hackbuild-ui's, and a
view fits the stage and rack layout of hackbuild-ui 0.10 as it is.

## The views

- `CharacterStage`: a body on the `@hackbuild/avatar-host` stage, with
  idle, gaze, blinks and lips from `@hackbuild/presence` and
  `@hackbuild/lipsync`. It writes a `.hb-lay-stage`: the lit stage, the
  corner plate (name, then what the body is doing), turn around and
  framing (bust, from the knees up, or full body) at the top right, the
  verb row at the foot and an inset slot at the top left. The default
  verbs are say hello (the one pink action), wave, nod and look around.
  Files dropped on it become the body. `say(speech)` speaks real audio:
  an AudioBuffer or an audio element plays through an analyser whose
  level and bands open the mouth, with the word or phoneme timings a
  speech engine reports (`@hackbuild/speak`'s `Timed`, or lipsync events
  such as the bellows adapter makes). Text alone moves the lips on
  estimated word timings with no sound; `gesture("wave" | "nod" | "shake" | "bow")`
  plays a gesture written in code over the body's own bones; `play(clip)`
  plays any presence clip or three.js AnimationClip.
- `AvatarDrop`: a drop zone and a pick button. A file loads once into the
  normalized humanoid, is checked as a stage body would be, drawn as a
  still and freed. The hackbuild-ui avatar card (`.hb-avcard`) shows the
  still, the name, the size line
  ("168 kb glb, 5.5 k triangles"), the licence the file states and the
  rig check in plain words ("no mouth shapes. the lips stay still while it
  talks."); pressing it sends `use`. The files go out on `picked`, the
  report on `checked`.
- `ClipStrip`: the hackbuild-ui clip strip (`.hb-clipstrip`): each clip's
  still, name and length, the picked one pressed and the playing one
  marked, and one play button that plays or stops the picked clip. Stills come from the item, or are drawn
  in the background on a clay figure by the avatar-host thumb queue.

## Entries

- `.`: the words and the clip items, no three.js and no DOM.
  `rigCheck`, `sizeLine`, `licenceLine`, `secondsWord`; `clipsFromPack`
  `speechEvents`, `estimateSeconds` (what a speech becomes on the mouth
  clock); `clipsFromPack` (a `@hackbuild/bake` pack and report, with a warning on a loop that does
  not close), `clipFromFindings` (a `@hackbuild/retarget` motion),
  `clipsFromBody`, `clipMeta`, `nextClip`.
- `/vanilla`: `characterStage(host, opts)`, `avatarDrop(host, opts)`,
  `clipStrip(host, opts)`, `gestureClip`, `animationClipOf`, and
  `defineMotionViews(opts)`, which defines `hb-character-stage`,
  `hb-avatar-drop` and `hb-clip-strip`. Importing defines nothing.
- `/vue`: `CharacterStage` (props `name`, `src`, `framing`, `verbs`,
  `drop`, `options`; slot `inset`), `AvatarDrop` (`go`, `label`,
  `options`) and `ClipStrip` (`items`, `current`, `playing`, `go`).
  Events are the view's events by type.
- `/iife`: the vanilla entry as one classic script; three.js comes from
  the page as `THREE`.

```ts
import { defineMotionViews } from "@hackbuild/motion-views/vanilla";

defineMotionViews({ stage: { vrm: () => import("@hackbuild/avatar/vrm").then((m) => m.vrmHook()) } });
const stage = document.querySelector("hb-character-stage")!;
document.querySelector("hb-avatar-drop")!.addEventListener("picked", (e) => stage.handle?.show(e.detail.files));
```

three.js, Vue and `@virgilvox/hackbuild-ui` 0.10 are peers; three.js and
Vue are optional (the main entry needs neither). No model or weight file
is bundled: a body comes from a URL or a file the person drops.

## What is verified, and what is not

- Verified (measured, 2026-11-25, headless system Chrome on macOS 12,
  `node tools/smoke-views.mjs`): the stand-in shows and a frame is drawn;
  the full body shot stands further back than the bust (2.78 m to
  4.03 m); say hello plays audio written in code with its word timings
  and the audio level reaches the lips (peak 0.215); audio with no
  timings moves the lips by its level; text alone falls back to estimated
  timings; it goes quiet when the audio ends; wave plays on the upper body;
  turn around turns the body half a circle; the stand-in written as a
  .glb in the page loads, maps 24 bones, gets a still and reads "no
  licence in the file"; a text file is refused in plain words; a bvh walk
  retargets onto the stand-in and reads as a walk; six clips bake into one
  pack and read back; a loop cut short is flagged at its seam; a picked
  clip plays; a still is drawn for every clip. Unit tests cover the words
  and the clip items.
- The three demo pages pass the suite's screen gate at 1440 and 390.
- Not verified: speech from a real speech engine (the smoke's voice is
  a hum written in code with word timings in the engine's shape), a real
  VRM, GLB or FBX avatar with a face (the smoke uses
  the stand-in built in code, which has no mouth or blink shapes), the Vue
  components in a running Vue app (they typecheck; no page mounts them
  yet), and frame rate on a real GPU, since the smoke runs headless.
- Known: AvatarDrop loads the file once and the stage loads it again, so a
  large file is read twice.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 3,266 bytes | 3,429 bytes |
| `dist/motion-views.iife.js` (single file build) | 214,660 bytes | 225,393 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.
