import { LipSync, OCULUS_VISEMES, drive, type ExpressionSink } from "@hackbuild/lipsync";

const lips = new LipSync();
// word timings as a TTS engine reports them, in seconds on your clock
lips.push([
  { type: "word", time: 0.0, end: 0.35, text: "hello" },
  { type: "word", time: 0.4, end: 0.8, text: "mama" },
]);

// any object with setValue: an avatar ExpressionRig or a three-vrm expression manager
const face = new Map<string, number>();
const sink: ExpressionSink = { setValue: (name, weight) => face.set(name, weight) };

for (let t = 0; t <= 1; t += 1 / 30) {
  const frame = lips.update(t, 1 / 30);
  const top = frame.visemes.indexOf(Math.max(...frame.visemes));
  console.log(t.toFixed(2), frame.source, OCULUS_VISEMES[top], frame.open.toFixed(2));
  drive(sink, frame, "vrm"); // face now holds aa, ih, ou, ee, oh
}
