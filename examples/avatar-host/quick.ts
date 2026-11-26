import { AvatarStage } from "@hackbuild/avatar-host/three";

// the stage sizes itself to its container and pauses while hidden or off screen
const box = Object.assign(document.createElement("div"), { style: "height: 70vh" });
const input = Object.assign(document.createElement("input"), { type: "file", multiple: true });
document.body.append(input, box);
const stage = new AvatarStage(box, {
  // three-vrm is imported on the first .vrm only
  vrm: () => import("@hackbuild/avatar/vrm").then((m) => m.vrmHook()),
});
stage.on("failed", (e) => console.warn(e.message));
stage.on("stats", (e) => console.log(e.stats.fps.toFixed(0), "fps"));

// the placeholder body is built in code; pick a .vrm, .glb or .fbx (and its textures) to swap it
stage.showPlaceholder().setExpression("happy", 0.5);
input.onchange = async () => {
  const body = await stage.show([...(input.files ?? [])]);
  body?.setGazeMode("listen");
};
