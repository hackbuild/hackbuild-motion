# Browser checks

Checks that need a real browser at real frame rate, with a person looking.
None of them has run. Each line moves to the package README's verified
list, with a date and the name of who looked, when it runs.

| package | check | status |
|---|---|---|
| motion-net | WebGPU session on a real adapter: outputs within 1e-4 of the CPU f32 path on the seeded parity inputs, time per run | not run |
| motion-net | blob worker session from file:// and from http, and the in page fallback when the page refuses blob workers | not run |
| motion-net | quadruped gait on a dog rig at 60 Hz: feet do not slide while predictions are fresh, no pop when a sequence lands | not run |
| motion-net | neural to procedural handover on a stall (throttled tab) and back after 2 s, with bones and paws inertialized | not run |
| motion-net | turn in place on the real network: the dog steps around instead of sliding | not run |
| motion-match | matching over real CC0 UAL clips on a humanoid, transitions and foot slide | not run |
| presence | gaze, aversion and saccades on a real avatar | not run |
| presence | head level on a mocap idle | not run |
| presence | loop seam blend on a real idle clip; idle handback and background loop | not run |
| presence | the body turning for targets behind | not run |
| presence | point, reach and throw curves on a rig | not run |
| avatar | skinned meshes after the A pose to T pose arm lift on real Mixamo, UAL and VRoid files | not run |
| avatar | cutout materials on hair and lashes | not run |
| avatar | the head hider in a first person camera | not run |
| avatar | an FBX loaded from a real file | not run |
| lipsync | a face driven from real TTS events and from real microphone audio | not run |
| bake | the bake page in a browser on a real model, texture hook included | not run |
