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
