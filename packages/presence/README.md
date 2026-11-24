# @hackbuild/presence

The procedural layers that make a standing humanoid read as present,
written for this library from an earlier in-house humanoid and published
research on gaze and idle motion. Plain TypeScript over the `@hackbuild/organic` springs and samplers,
with a three.js adapter under `/three`. No wasm.

- `GazeController`: aversion episodes timed after Andrist 2014 per mode
  (listen, talk, think), direction bins after Lee, Badler and Badler 2002,
  small saccades inside a fixation, head recruitment past a 16 degree eye
  only range with slope 0.77 (Stahl 1999, vendor) and a 20 to 50 ms head
  latency, eyes clamped to 25 degrees yaw and 10 degrees pitch from where
  the head points, gaze evoked blinks, and a `bodyTurn` output for targets
  past the head range.
- `SeamHold`: hysteresis at the atan2 seam. Past 2.2 rad with a sign flip
  the previous side is kept, so a target crossing behind does not whip the
  head 180 degrees.
- `Blink` (1 to 8 s gaps, 85 percent single, triangle lid curve) and
  `Breath` (inhale 40 percent of the cycle, a slow rate drift).
- `IdleScheduler`: a postural change about every 20 s (fidget, weight shift,
  recentre) and face touches about 23 an hour, cancelled when the body moves.
- `pointGesture` (Peeters 2013 timing, apex at 1.37 s), `planReach` and
  `reachWeight` (duration grows with distance), `planThrow` and
  `throwPose` (proximal to distal chain, Owens 2024 phase shares, seeded
  jitter and order swaps).
- `ClipPlayer`: one owner for every bone. A base layer (idle loop, blended
  by speed into locomotion loops that share a normalized phase for cadence
  matching), a body layer and an upper body layer masked to a bone set.
  Plays replace or queue; a background loop waits for a running one shot;
  a one shot fades back to the base (idle handback, with `ended` and
  `handback` events); `hold: Infinity` holds until `release()`. Loops whose
  first and last frames differ by more than 2 degrees blend their last
  0.4 s into the start and restart from 0.4 s.
- `HeadLevel`: low passes the clip's head pitch (1.2 s) and lifts the slow
  part by up to 10 degrees, so a mocap idle stops glaring while nods pass.
- `/three`: `clipFromThree` (AnimationClip to a flat clip), `applyPose`,
  `applyGaze` (neck and head share, eye bones), `aimBone` and `reachArm`.

Every random draw comes from an injected `Rng`.

## Install

Not published yet. From a clone:

    npm ci && npm run build -w @hackbuild/organic -w @hackbuild/presence

## Use

```ts
import { seededRng } from "@hackbuild/organic";
import { ClipPlayer, GazeController, HeadLevel, Breath } from "@hackbuild/presence";
import { applyGaze, applyPose, clipFromThree } from "@hackbuild/presence/three";

const rng = seededRng("ada");
const idle = clipFromThree(idleClip, boneNames, { loop: true });
const player = new ClipPlayer({ idle, upperBones: armIndices });
const gaze = new GazeController({ rng });
const level = new HeadLevel();

function frame(dt: number) {
  const pose = player.update(dt);
  level.apply(dt, pose, headIndex);
  applyPose(pose, bones);
  gaze.setTarget(listenerHead);
  const g = gaze.update(dt, eyePoint, bodyYaw);
  applyGaze(g, { neck, head, leftEye, rightEye });
  face.blink = g.blink;
  if (g.bodyTurn) turnBodyBy(g.bodyTurn);
}
```

`dist/presence.iife.js` is the single file build (`HackbuildPresence`,
`THREE` read from the page).

## Develop

    npm run build -w @hackbuild/presence
    npx vitest run packages/presence

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `npx vitest run packages/presence` passed 26 of 26 tests
  (counted), two of them fast-check properties.
- 2026-11-22: a target circling behind a still body moved the head less
  than 0.02 rad per frame while it crossed the seam, and the controller
  asked the body to turn; with the body turning as asked at 2 rad/s, the
  head moved less than 0.1 rad per frame over two full circles (computed).
- 2026-11-22: eyes stayed inside 25 degrees yaw and 10 degrees pitch from
  the head for random targets, seeds and modes (property, 60 runs).
- 2026-11-22: over 10 minutes per mode, the averted share ranked listen
  below talk below think, with listen between 0.08 and 0.25 and talk
  between 0.3 and 0.55 (computed against the Andrist ratios).
- 2026-11-22: head yaw jerk under 2,000 rad/s^3 while tracking a moving
  target with aversion on (computed).
- 2026-11-22: blink gaps between 1 and 8.4 s with 5 to 25 percent doubles;
  breathing at 15 per minute counted 27 to 33 cycles in 2 minutes; idle
  changes 2.4 to 3.6 a minute and face touches 14 to 32 an hour over two
  simulated hours (computed).
- 2026-11-22: a loop with a 17 degree seam wrapped with a step under 0.02
  rad, against 0.3 rad unblended (computed); one shot handback, hold and
  release, background waiting, the upper body mask and walk to jog cadence
  matching hold in synthetic clip tests.
- 2026-11-22: the three.js adapter sampled an AnimationClip, wrote it to
  bones, aimed an arm within 0.02 rad of a target and split head yaw
  between neck and head (measured in the adapter test).

### Not verified by anything

- Nobody has looked at any of this on a real avatar in a real browser at
  real frame rate. Gaze, aversion, head level and the seam blend on a mocap
  idle are unchecked by eye.
- The idle scheduler emits events and weights; the arm and face touch poses
  that consume them are left to the caller (the `reachArm` helper covers
  the arm part).
- Clip transitions crossfade with minimum jerk weights; inertialized
  transitions over the organic `Inertializer` are open.
- Face tracks in clips, procedural nod, shake and think gestures, foot
  locking and turn in place steps are not in this package yet.
- Reach duration constants and the 0.6 s point retract are inferred.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 9,473 bytes | 9,946 bytes |
| `dist/presence.iife.js` (single file build) | 12,343 bytes | 12,960 bytes |

Measured 2026-11-23 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

## Licence

Code MIT (`LICENSE` in this package and at the repository root). This
README is CC-BY-4.0, its code samples also MIT.
