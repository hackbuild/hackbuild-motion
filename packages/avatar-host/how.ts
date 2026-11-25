// how this works: the fold on the package page and in the suite. Kept out of
// the runtime entry; tsconfig.how.json typechecks it. Text from the README.
export interface How {
  /** one line: what the package is */
  what: string;
  /** short paragraphs: how it works */
  how: string[];
  packages: string[];
  /** the install line once the packages are on npm */
  install: string;
  /** the line that works today */
  today?: string;
  code: string;
  lang?: string;
  links: { page?: string; source?: string };
}

const how: How = {
  what: "host a character on a three.js stage in any container: ticketed loads through @hackbuild/avatar, a follow camera, the presence frame order, a loop that pauses when hidden, and a hb-avatar-host element.",
  how: [
    "a character on a three.js stage in any container. bodies load through @hackbuild/avatar into the normalized humanoid space; the camera frames and follows the posed body.",
    "loads are ticketed: show(source) resolves to the result, or to null when a later show replaced it, so a slow file never lands over a newer one. a drop of files finds the model and the files it references by path, then by name.",
    "one animation loop runs, and it stops while the page is hidden, the host is off screen or at zero size, or a sheet covers it. the main entry has no three.js; the hb-avatar-host element is under /three.",
  ],
  packages: ["@hackbuild/avatar-host"],
  install: "npm install @hackbuild/avatar-host",
  today: "git clone https://github.com/hackbuild/hackbuild-motion && cd hackbuild-motion && npm ci && npm run build && npm pack -w @hackbuild/avatar-host",
  code: `import { defineAvatarHost } from "@hackbuild/avatar-host/three";
import { droppedFiles } from "@hackbuild/avatar-host";

defineAvatarHost("hb-avatar-host", {
  // three-vrm (MIT) is imported on the first .vrm only
  vrm: () => import("@hackbuild/avatar/vrm").then((m) => m.vrmHook()),
});
const el = document.querySelector("hb-avatar-host")!;
el.addEventListener("loaded", (e) => console.info(e.detail.caps));
el.addEventListener("failed", (e) => showError(e.detail.message));
zone.addEventListener("drop", async (e) => el.showFiles(await droppedFiles(e.dataTransfer!)));`,
  lang: "ts",
  links: { page: "https://hackbuild.github.io/hackbuild-motion/avatar-host/", source: "https://github.com/hackbuild/hackbuild-motion/tree/main/packages/avatar-host" },
};

export default how;
