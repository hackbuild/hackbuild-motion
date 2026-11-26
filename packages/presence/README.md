# @hackbuild/presence

Make a standing humanoid look present: gaze, blink, breath, idle moves, gestures, a layered clip player and a face driver.

[![npm](https://img.shields.io/npm/v/@hackbuild/presence)](https://www.npmjs.com/package/@hackbuild/presence) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 11.7 kB measured](https://img.shields.io/badge/gzip-11.7%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

## What it does

- Points the eyes and head at a target with aversion episodes, small saccades, head recruitment past the eye range and clamped eye aim, and tells you when the body should turn.
- Blinks, breathes and schedules idle fidgets, weight shifts and face touches from an injected random source.
- Times pointing, reaching and throwing as weight and angle curves you apply to your own rig.
- Plays clips on a base, body and upper body layer that write every bone, with loop seams and a hand back to idle.
- Drives every expression weight through one face: moods ease in, a quiet face rests at a slight smile, and speech and clip face tracks take their channels.

## Install

```sh
npm install @hackbuild/presence @hackbuild/organic
```

`@hackbuild/organic` is a dependency and installs with it; the quick start imports `seededRng` from it, so the line names it too. The core entry is plain TypeScript with no wasm and no three.js. `three` is an optional peer used only by the `/three` subpath.

| subpath | needs | pin |
|---|---|---|
| `@hackbuild/presence` | nothing beyond `@hackbuild/organic` | none |
| `@hackbuild/presence/three` | `three` (optional peer) | 0.186.1 or later |
| `@hackbuild/presence/iife` | a page with a `THREE` global for the three.js parts | none |

## Quick start

```ts
import { seededRng } from "@hackbuild/organic";
import { ClipPlayer, Face, GazeController, restStance } from "@hackbuild/presence";

// the rest stance as the idle clip: arms down, made in code, no model file
const bones = ["hips", "spine", "head", "leftUpperArm", "rightUpperArm"];
const player = new ClipPlayer({ idle: restStance(bones) });
const gaze = new GazeController({ rng: seededRng("quick") });
const face = new Face({ setValue: (name, weight) => console.log(name, weight.toFixed(2)) });

gaze.setTarget([0.4, 1.6, 1.2]); // a listener's head, meters, +Z forward
face.set("happy", 0.6);
for (let i = 0; i < 60; i++) {
  const pose = player.update(1 / 60); // local rotations x y z w per bone
  const g = gaze.update(1 / 60, [0, 1.6, 0], 0);
  face.lid(g.blink);
  face.update(1 / 60, player.faces);
  if (i === 59) console.log(pose.rotations.length, g.headYaw.toFixed(3), g.eyeYaw.toFixed(3));
}
```

## Live example

The package page, with how each layer works, is at [hackbuild-motion/presence](https://hackbuild.github.io/hackbuild-motion/presence/). The [avatar-host page](https://hackbuild.github.io/hackbuild-motion/avatar-host/) runs the whole presence frame on the placeholder body or a model you drop.

## Concepts

### one owner per channel

`ClipPlayer` writes every bone each frame and `Face` writes every expression weight. Nothing else should write to the same bones or channels, so two systems never fight over a value. Gaze is added after the pose is written (`applyPose`, then `applyGaze`).

### layers

The base layer is the idle loop, blended by speed into locomotion loops that share a phase so the cadence matches. A body layer plays one shots and loops over it, and an upper body layer is masked to the bone set you name. A play replaces or queues; a background loop waits for a running one shot; a finished one shot fades back to the base and reports `ended` and `handback`. `hold: Infinity` holds the last frame until `release()`.

```ts
const wave = player.play(waveClip, { layer: "upper", fade: 0.12 });
player.setLocomotion(1.4); // meters per second picks and blends the locomotion loops
```

### loop seams

A loop whose first and last frames differ by more than 2 degrees blends its last 0.4 s into the start and restarts from 0.4 s, so it wraps without a pop. `planLoop` shows the plan for a clip.

### gaze modes and the seam behind

`setMode("listen" | "talk" | "think")` changes how often and how long the gaze looks away. Eyes cover a small range alone; past it the head joins. When the target crosses behind the body, the controller keeps the side it was on instead of whipping the head across, and `bodyTurn` says how far the body should turn.

### faces

A clip may carry face tracks, one weight per frame per expression. After `update`, `player.faces` holds this frame's weights; pass them to `face.update`. `face.set(mood, weight)` eases toward the mood; with no mood the face rests at `RESTING_FACE`, and `setResting({})` gives a neutral face. Mouth shapes from speech go in through `face.mouth` and win their channels.

### randomness is injected

Every random draw comes from the `Rng` you pass, such as `seededRng("name")` from `@hackbuild/organic`, so a seed replays the same blinks, aversions and idle moves.

## API overview

| export | what it does |
|---|---|
| [`ClipPlayer`](../../docs/api/presence/index.md#clipplayer) | layered clip player with loop seams and idle handback |
| [`GazeController`](../../docs/api/presence/index.md#gazecontroller) | eyes and head toward a target, with aversion and saccades |
| [`Face`](../../docs/api/presence/index.md#face) | the one owner of every expression weight |
| [`Blink`](../../docs/api/presence/index.md#blink) | spontaneous blinks and gaze evoked ones |
| [`Breath`](../../docs/api/presence/index.md#breath) | breathing phase, fill, chest pitch and shoulder rise |
| [`IdleScheduler`](../../docs/api/presence/index.md#idlescheduler) | fidgets, weight shifts and face touches while idle |
| [`HeadLevel`](../../docs/api/presence/index.md#headlevel) | lifts a head that a clip holds low, keeping nods |
| [`pointGesture`](../../docs/api/presence/index.md#pointgesture) | arm weight of a pointing gesture over time |
| [`planReach`](../../docs/api/presence/index.md#planreach) | reach timing that grows with distance |
| [`planThrow`](../../docs/api/presence/index.md#planthrow) | a throw as a proximal to distal chain with jitter |
| [`restStance`](../../docs/api/presence/index.md#reststance) | a one frame idle clip with the arms down |
| [`clipFromThree`](../../docs/api/presence/three.md#clipfromthree) | a three.js AnimationClip as a flat clip |
| [`applyPose`](../../docs/api/presence/three.md#applypose) | write a pose onto three.js bones |
| [`applyGaze`](../../docs/api/presence/three.md#applygaze) | add a gaze frame onto neck, head and eye bones |
| [`reachArm`](../../docs/api/presence/three.md#reacharm) | swing an arm toward a world point |

The full reference is in [docs/api/presence](../../docs/api/presence/README.md).

## Browser support

| part | needs | Chrome | Safari | Firefox | phone |
|---|---|---|---|---|---|
| core entry | ES2022 | yes (measured) | yes (inferred) | yes (inferred) | yes (inferred) |
| `/three` | three.js and WebGL for drawing | yes (measured) | yes (inferred) | yes (inferred) | yes (inferred) |
| single file build | a classic script, file:// included | yes (measured) | unknown | unknown | unknown |

There is no wasm and no worker, so nothing falls back. The single file build `dist/presence.iife.js` sets a `HackbuildPresence` global and reads `THREE` from the page.

## Errors and troubleshooting

Nothing in this package throws. What can go wrong shows as motion:

- The head glares down on a mocap idle: the clip holds the head low. Run `HeadLevel.apply` on the pose before `applyPose`.
- Eyes show the socket on a non VRM rig: its eye bones are not made for wide turns. Lower `eyeLimitDeg` in the `GazeRig`.
- Arms stay in a T pose: there is no idle clip. Pass `restStance(names)` or `restStanceFromThree(...)` as the idle.
- The gaze stares without drifting: `organic` is off. Leave it on for aversion and saccades.

## Works with

- [@hackbuild/organic](../organic/README.md) gives the springs, samplers and the seeded `Rng`.
- [@hackbuild/avatar](../avatar/README.md) loads models into the normalized space this package expects, and its `ExpressionRig` is a face sink.
- [@hackbuild/lipsync](../lipsync/README.md) writes mouth shapes into `face.mouth`.
- [@hackbuild/avatar-host](../avatar-host/README.md) runs the whole presence frame on a three.js stage.
- [@hackbuild/retarget](../retarget/README.md) brings clips from other rigs into the bone order the player uses.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. No models or weights ship here.

## What is verified, and what is not

| check | result |
|---|---|
| `npx vitest run packages/presence` | 37 of 37 tests pass (counted), two fast-check properties |
| a target circling behind a still body | head moved under 0.02 rad per frame across the seam, and the body was asked to turn (computed) |
| the body turning as asked at 2 rad/s, two full circles | head moved under 0.1 rad per frame (computed) |
| eyes for random targets, seeds and modes | inside 25 degrees yaw and 10 degrees pitch from the head (property, 60 runs) |
| averted share over 10 minutes per mode | listen below talk below think; listen 0.08 to 0.25, talk 0.3 to 0.55 (computed against published ratios) |
| head yaw jerk tracking a moving target | under 2,000 rad/s^3 (computed) |
| blink, breath and idle over two simulated hours | blink gaps 1 to 8.4 s with 5 to 25 percent doubles; 27 to 33 breaths in 2 minutes at 15 per minute; 2.4 to 3.6 idle changes a minute; 14 to 32 face touches an hour (computed) |
| a loop with a 17 degree seam | wraps with a step under 0.02 rad, against 0.3 rad unblended (computed) |
| handback, hold and release, background waiting, upper body mask, walk to jog cadence | hold in synthetic clip tests |
| the three.js adapter | samples an AnimationClip, writes bones, aims an arm within 0.02 rad, splits head yaw between neck and head (measured in the test) |
| face driver | a mood reaches 0.63 of its target in 1/8 s within 1e-6; clip weights above the mood win and let go; speech wins the mouth; blink off mid blink writes 0 (computed) |
| rest stance on a rig whose left arm rests turned 90 degrees | hands more than 0.4 m below the shoulders, beside the body (computed) |
| headless Chrome, the avatar-host page | the placeholder stands in the rest stance (looked at in a screenshot) |

Not verified by anything:

- Nobody has looked at gaze, aversion, head level, the seam blend or the face driver on a real avatar in a real browser at real frame rate.
- The idle scheduler emits events and weights; the arm and face touch poses that use them are left to you (`reachArm` covers the arm).
- Clip transitions crossfade with minimum jerk weights; inertialized transitions are not in this package yet.
- Procedural nod, shake and think gestures, foot locking and turn in place steps are not in this package yet.
- Reach duration constants and the 0.6 s point retract are inferred.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 11,661 bytes | 12,244 bytes |
| `dist/presence.iife.js` (single file build) | 15,031 bytes | 15,782 bytes |

Measured 2026-11-26 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.
