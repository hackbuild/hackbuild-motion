import { avatarDrop, characterStage } from "@hackbuild/motion-views/vanilla";

// the stage shows a placeholder body built in code until you give it one
const host = document.createElement("div");
host.style.height = "480px";
document.body.append(host);
const stage = characterStage(host, { name: "stand-in", hello: "hello. drop a vrm, glb or fbx on me." });
stage.on((e) => e.type === "doing" && console.log("doing", e.word));

// a drop card: press the card of a checked avatar to put it on the stage
const card = document.body.appendChild(document.createElement("div"));
avatarDrop(card).on((e) => {
  if (e.type === "checked") console.log(e.report.check.head, e.report.size);
  if (e.type === "use") void stage.show(e.files);
});

// text alone moves the lips on estimated word timings, with no sound
await stage.say("you can drop a model on me");
stage.gesture("wave");
