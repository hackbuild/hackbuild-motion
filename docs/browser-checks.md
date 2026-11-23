# Browser checks

Checks that need a real browser at real frame rate. The example pages in
`examples/` (live at https://hackbuild.github.io/hackbuild-motion/) carry
them: `npm run examples && npm run examples:check` opens each page with
`?auto` in the system Chrome, headful, on the real GPU, and writes
`.local/checks.json` and a screenshot per page to `.local/shots/`.

## Run of 2026-11-23

- Browser: Chrome 150.0.7871.125, headful, driven by puppeteer-core 25.18.1.
- Machine: Apple M1, macOS 12. WebGL: ANGLE Metal on the Apple M1.
  WebGPU adapter: vendor apple, architecture common-3, shader-f16 present.
- Who looked: the automated pass measured every number below. The owner
  has not looked at any page yet. RULES.md asks for a person to look at
  motion at real frame rate before it is called done, so every motion row
  below is measured, not looked at.
- The motion-net page was rewritten on 2026-11-23 (MIT, from a
  functional specification) and rerun on the same machine and browser with
  the upstream weights (CC BY-NC 4.0, sha-256 9568debf...b372) served
  through `HB_LOCAL_DIR` for that run only. Its earlier rows are replaced
  by the one row below.

Counts in the table below: 13 pass, 0 fail, 10 not run (counted). The
fix pass of 2026-11-23 reran gait, ik, retarget, motion-match and lipsync
on the same machine and browser; the motion-net row was not rerun (the
page now fetches weights only from urls given to it). Lipsync on that
rerun: timed text open on 49 of 60 samples, 17 word events and 200 open
frames from the system voice. Earlier text on this page gave counts of
13, 15 and 12 pass across runs; those are replaced by the table count.

| package | check | status | numbers and reason |
|---|---|---|---|
| gait | procedural dog walk at real frame rate, planted toes hold (rerun 2026-11-23 after the gait stride start fix) | pass | 59.88 fps p50, frame 17.5 ms p95, gait work 0.5 ms p95, planted toe slide 0 mm, 0 of 1680 leg frames out of reach (measured) |
| ik | two bone arm and leg, fabrik chain, look at and foot lock (rerun 2026-11-23, drift now on the solved foot) | pass | arm end error 0 mm in reach, chain end error under 0.01 mm, solved locked foot drift 0 mm over 241 locked frames, ik work 0.4 ms p95 (measured). Before 2026-11-23 the drift was read from the lock's stored target, which cannot fail. |
| retarget | a BVH walk on another rig (centimeters, other names) onto the normalized humanoid (rerun 2026-11-23 after the BVH rest height fix) | pass | tagged walk, retarget 9.2 ms, lowest toe 22.4 mm under the floor, from a clip written in code with no contact fix (measured) |
| motion-net | quadruped host on the published weights at real frame rate, wandering through speeds and turns | pass | blob worker, 4.5 ms per evaluation, 5 ms wall clock latency, 59.88 fps p50, pinned stance paw slide p95 5.6 mm per frame, network paws 10.8 mm (measured). The screenshot shows a four legged skeleton; nobody has watched the gait at frame rate. |
| motion-match | motion matching over a synthetic gait clip database at real frame rate (rerun 2026-11-23) | pass | bounds 10 mm p95 and 50 mm max per frame. Earlier run: the row read pass with 171.6 mm max at a transition and no bound, which is fail 1 by today's bound. A first rerun with the bound failed at 162.5 mm max (start and stop clips looped). After the fix: 17 transitions in 12 s, contact foot slide 4.96 mm per frame p95 and 16.7 mm max, matcher 0.2 ms p95, database 12.5 ms (measured) |
| motion-match | matching over real CC0 UAL clips on a humanoid, transitions and foot slide | not run | no adapter from a UAL clip to the matcher's clip input in the page yet; the clips load on the avatar page |
| presence | gaze, aversion and saccades on a real avatar | not run | no presence page yet |
| presence | head level on a mocap idle | not run | no presence page yet |
| presence | loop seam blend on a real idle clip; idle handback and background loop | not run | no presence page yet |
| presence | the body turning for targets behind | not run | no presence page yet |
| presence | point, reach and throw curves on a rig | not run | no presence page yet |
| avatar | an FBX loaded from a real file | pass | the CC0 UAL1_Standard.fbx (24.9 MB): 52 humanoid bones, 45 clips, download 954 ms, parse to scene 6567 ms (measured) |
| avatar | skinned meshes after the A pose to T pose arm lift, UAL | pass | left upper arm 0 degrees below horizontal after normalize, 1 skinned mesh, walk clip at 59.88 fps p50 (measured). The deformation needs a person looking. |
| avatar | the same lift on real Mixamo and VRoid files | not run | no CC0 or MIT Mixamo or VRoid file to fetch |
| avatar | cutout materials on hair and lashes | not run | the CC0 mannequin has no hair or lashes |
| avatar | the head hider in a first person camera | pass | the head is scaled away during the first person draw and restored after (measured). How it looks needs a person. |
| lipsync | visemes from timed text | pass | mouth open on 49 of 60 samples over 3 s (measured, rerun 2026-11-23) |
| lipsync | a face driven from real TTS events | pass | 17 word boundary events from the Chrome system voice, mouth open on 200 frames, on a 2D face (measured, rerun 2026-11-23). A real avatar face needs a person looking. |
| lipsync | a face driven from real microphone audio | not run | needs a microphone and a person speaking |
| lipsync | the bellows voice drives the face from its phoneme spans (rerun 2026-11-23, bellows-voice 0.8.0) | pass | bellows-voice 0.8.0 on bellowsjs 0.5.0 from the npm CDN, 54 spans, speak() planned in 7 ms, mouth open on 319 of 370 frames and lips shut on 29 (measured). Whether mouth and sound line up needs a person looking and listening. |
| lipsync | the bellows voice drives the face from its tract model (rerun 2026-11-23, bellows-voice 0.8.0) | pass | the same line through `TractModel` and the articulatory source, open on 328 of 371 frames, lips shut on 12 (measured); sync not judged by a person |
| lipsync | the bellows articulator probe drives the face as the audio plays (run 2026-11-23, bellows-voice 0.8.0) | pass | `articulatorProbe` at 60 frames per second read through `fromProbe` at the heard time, open on 293 of 371 frames, lips shut on 30 (measured); sync not judged by a person |
| bake | the bake page in a browser on a real model, texture hook included | not run | no bake page yet |

## Mobile and width pass of 2026-11-23

The `?auto` checks ran before and after the restyle on the same machine
and browser, without local weights: 6 pass, 0 fail, 1 not run (motion-net,
no weights given) both times, with the numbers within run to run spread.

After the restyle on hackbuild-ui 0.4.4, every page and the index were
opened from a local server in the same Chrome through puppeteer-core,
with no `?auto`, at these widths:

| profile | widths and settings |
|---|---|
| puppeteer `iPhone 15` | 393 by 659, touch, mobile, device pixel ratio 3 |
| puppeteer `Pixel 7` | 393 by 851, touch, mobile |
| set widths, phone | 320, 360 and 390 px, touch, mobile, device pixel ratio 2 |
| set widths, desktop | 768, 1024, 1280 and 1440 px, mouse |

Measured on each: no horizontal scroll at any width (document scroll
width equal to the window width on all 72 loads); no button, select,
text field, link or check row under 44 px tall on a phone width; no field
under 16 px there; on the phones the viewport is square and ends at
446 to 564 px from the top, above the fold of a 659 px tall iPhone 15
window. On the five three.js pages a one finger drag and a two finger
pinch sent as touch events to the canvas left the page unscrolled, with
`touch-action: none` on the canvas. Whether the camera moved the right
way was looked at in screenshots, not measured.

The avatar page loaded the CC0 mannequin on the iPhone 15 profile and
framed the face (screenshot looked at by the agent that ran the pass).
The lipsync face draws closer on a viewport under 641 px. The owner has
not looked at any page on a phone yet, and no real phone was used.
