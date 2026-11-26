import { ClipSet, load, MotionMatcher } from "@hackbuild/motion-match";

await load();
// a clip database made in code: three steady gaits, a start and a stop
const clips = new ClipSet(30);
for (const speed of [0.6, 1.2, 2]) clips.addSynthetic({ speed });
clips.addSynthetic({ speed: 0, speedEnd: 1.2 });
clips.addSynthetic({ speed: 1.2, speedEnd: 0 });
const matcher = new MotionMatcher(clips);

// one second at 60 frames a second, asking for a gentle left turn
for (let i = 0; i < 60; i++) {
  const root = matcher.update(1 / 60, { speed: 1.2, turnRate: 0.4 });
  const pose = matcher.pose(); // local rotations, hips and feet in the root frame
  if (i % 20 === 0) console.log(root.x.toFixed(2), root.z.toFixed(2), matcher.last.clip, pose.feet.length);
}
console.log(matcher.last.transitions, "transitions,", matcher.motorState().contacts);
matcher.dispose();
clips.dispose();
