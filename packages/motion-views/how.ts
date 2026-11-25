// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// shape in tools/how.d.ts, checked by tsconfig.how.json, shipped in the tarball, never imported
// by the runtime entry. Text from the README.
const how: HowDoc = {
  what: "the motion views: CharacterStage, AvatarDrop and ClipStrip. each binds the motion packages to hackbuild-ui and ships as a vue component and a custom element.",
  how: [
    "CharacterStage puts a body on the @hackbuild/avatar-host stage, with the idle, gaze, blinks and lips that @hackbuild/presence and @hackbuild/lipsync give it. it writes the stage of the hackbuild-ui stage and rack layout: the lit stage, the corner plate with the name and what the body is doing, turn around and framing at the top right, the verb row at the foot and an inset slot at the top left. files dropped on it become the body. `say` plays real speech, an AudioBuffer or an audio element with the word or phoneme timings a speech engine gives, and the audio level opens the mouth; text alone moves the lips on estimated timings.",
    "AvatarDrop loads a dropped or picked file once into the normalized humanoid, checks it as a stage body would be checked, draws a still and frees it. it says what the body can do in plain words (no mouth shapes, no leg bones), the size, and the licence the file states, and hands the files on so a stage can wear them.",
    "ClipStrip shows clips as stills to pick from, with one play button. items come from a @hackbuild/bake clip pack (`clipsFromPack`, which flags a loop that does not close), from a @hackbuild/retarget motion (`clipFromFindings`) or from a body's own file. stills are drawn in the background on a clay figure by the avatar-host thumb queue.",
    "the main entry holds the words and the clip items with no three.js; `/vanilla` holds the views and `defineMotionViews()`, which defines hb-character-stage, hb-avatar-drop and hb-clip-strip; `/vue` holds the same views as vue components. the views carry no styles: every class is hackbuild-ui's.",
  ],
  packages: ["@hackbuild/motion-views", "@hackbuild/avatar-host", "@hackbuild/presence", "@hackbuild/lipsync", "@virgilvox/hackbuild-ui"],
  install: "npm install @hackbuild/motion-views @virgilvox/hackbuild-ui three",
  today: "git clone https://github.com/hackbuild/hackbuild-motion && cd hackbuild-motion && npm ci && npm run build && npm pack -w @hackbuild/motion-views",
  code: `import { defineMotionViews } from "@hackbuild/motion-views/vanilla";

defineMotionViews({ stage: { vrm: () => import("@hackbuild/avatar/vrm").then((m) => m.vrmHook()) } });
// <hb-character-stage name="moheeb"></hb-character-stage> <hb-avatar-drop></hb-avatar-drop>
const stage = document.querySelector("hb-character-stage")!;
document.querySelector("hb-avatar-drop")!.addEventListener("picked", (e) => stage.handle?.show(e.detail.files));
stage.addEventListener("doing", (e) => console.info(e.detail.word));

// vue: <CharacterStage :verbs="verbs" @verb="onVerb"><template #inset>..</template></CharacterStage>
import { CharacterStage, AvatarDrop, ClipStrip } from "@hackbuild/motion-views/vue";`,
  links: { page: "https://hackbuild.github.io/hackbuild-motion/character-stage/", source: "https://github.com/hackbuild/hackbuild-motion/tree/main/packages/motion-views" },
};
export default how;
