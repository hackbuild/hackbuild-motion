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
- The motion-net page took the upstream weights (CC BY-NC 4.0, sha-256
  9568debf...b372, matches upstream) and the owner's local bind pose,
  served to the page for this run only through `HB_LOCAL_DIR`; the
  deployed page asks for a bind pose URL or a dropped file.

Counts: 13 pass, 0 fail, 12 not run.

| package | check | status | numbers and reason |
|---|---|---|---|
| gait | procedural dog walk at real frame rate, planted toes hold | pass | 59.88 fps p50, frame 17.4 ms p95, gait work 0.6 ms p95, planted toe slide 0 mm, 0 of 1680 leg frames out of reach (measured) |
| ik | two bone arm and leg, fabrik chain, look at and foot lock | pass | arm end error 0 mm in reach, chain end error under 0.01 mm, locked foot drift 0 mm over 241 locked frames, ik work 0.7 ms p95 (measured) |
| retarget | a BVH walk on another rig (centimeters, other names) onto the normalized humanoid | pass | tagged walk, retarget 20.3 ms, lowest toe 22.4 mm under the floor, from a clip written in code with no contact fix (measured) |
| motion-net | WebGPU session on a real adapter: outputs within 1e-4 of the CPU f32 path on the seeded parity inputs, time per run | pass | max abs diff 5.07e-7; 16 frame run 7.5 ms p50 on WebGPU, 24.7 ms p50 on the CPU worker (measured) |
| motion-net | blob worker session over http | pass | the CPU session ran in the worker (measured) |
| motion-net | blob worker session from file://, and the in page fallback when the page refuses blob workers | not run | the harness serves over http; needs its own file:// page and a page with a worker refusing policy |
| motion-net | quadruped gait on a dog rig at 60 Hz: feet do not slide while predictions are fresh, no pop when a sequence lands | not run | measured only, nobody looked: contact site slide 10.3 mm per frame p95 and 17.3 mm max, worst joint jump past the root 61.2 mm, inference 5.1 ms p50, 59.88 fps p50 (measured). The slide is over the 5 mm per frame bound (inferred) and wants a person looking. The page draws the network joints, not the rig. |
| motion-net | neural to procedural handover on a stall (throttled tab) and back after 2 s | pass | the switch timing: handover at a prediction 0.30 s old under 8 fps frames, back on fresh predictions (measured). Whether bones and paws inertialize cleanly needs a person looking. |
| motion-net | turn in place on the real network | pass | root travel 0.012 m while yaw turned 3.61 rad over 3 s (measured). Whether the dog steps around needs a person looking. |
| motion-match | motion matching over a synthetic gait clip database at real frame rate | pass | database 26.5 ms to build, 9 transitions in 12 s, contact foot slide 6.2 mm per frame p95 and 171.6 mm max at a transition, matcher 0.2 ms p95 (measured) |
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
| lipsync | visemes from timed text | pass | mouth open on 50 of 60 samples over 3 s (measured) |
| lipsync | a face driven from real TTS events | pass | 17 word boundary events from the Chrome system voice, mouth open on 188 frames, on a 2D face (measured). A real avatar face needs a person looking. |
| lipsync | a face driven from real microphone audio | not run | needs a microphone and a person speaking |
| bake | the bake page in a browser on a real model, texture hook included | not run | no bake page yet |
