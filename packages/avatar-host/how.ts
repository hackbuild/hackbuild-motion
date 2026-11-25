// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// shape in tools/how.d.ts, checked by tsconfig.how.json, shipped in the tarball, never imported
// by the runtime entry. Text from the README.
const how: HowDoc = {
  what: "host a character on a three.js stage in any container: ticketed loads through @hackbuild/avatar, a follow camera, the presence frame order, a loop that pauses when hidden, and a hb-avatar-host element.",
  how: [
    "a character on a three.js stage in any container. bodies load through @hackbuild/avatar into the normalized humanoid space; the camera frames and follows the posed body.",
    "loads are ticketed: show(source) resolves to the result, or to null when a later show replaced it, so a slow file never lands over a newer one. a drop of files finds the model and the files it references by path, then by name.",
    "one animation loop runs, and it stops while the page is hidden, the host is off screen or at zero size, or a sheet covers it. the main entry has no three.js; the hb-avatar-host element is under /three.",
    "/thumbs draws previews in the background, one at a time on one renderer: clips on a clay figure at their most telling frame, characters at rest. urgent items go first, each is tried once, and the renderer is freed 20 s after the queue empties. save gets a png blob.",
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
zone.addEventListener("drop", async (e) => el.showFiles(await droppedFiles(e.dataTransfer!)));

// clip previews, the clips on screen first
const { clipThumbs } = await import("@hackbuild/avatar-host/thumbs");
const thumbs = clipThumbs({ save: (id, png) => blobs.put(id, png), failed: (id, why) => console.info(id, why) });
thumbs.want(visible.map((c) => ({ id: c.id, clip: () => c.load() })), true);`,
  lang: "ts",
  links: { page: "https://hackbuild.github.io/hackbuild-motion/avatar-host/", source: "https://github.com/hackbuild/hackbuild-motion/tree/main/packages/avatar-host" },
};

export default how;
