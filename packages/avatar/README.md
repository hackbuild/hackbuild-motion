# @hackbuild/avatar

Characters from VRM, Mixamo, UAL, generic GLB and FBX files in the
normalized humanoid space every package in this repository works in: VRM
1.0 bone names, T pose, +Z forward, meters, feet at y = 0. Bone naming and
rest analysis come from `@hackbuild/rig`; this package does the loading,
the repair and the parts a person sees.

- `loadAvatar(source, opts)`: a URL, bytes or a dropped File. The format is
  sniffed from content (GLB, glTF, VRM, VRMA, binary and ASCII FBX).
  glTF and FBX go through the three.js loaders; VRM goes through
  `@pixiv/three-vrm` when you pass `vrmHook()` from `/vrm`, and loads as
  plain glTF with a warning otherwise.
- `normalizeHumanoid(model)`: maps bones with no per rig table, wraps the
  model so it faces +Z, scales centimeter and millimeter rigs to meters,
  stands it on y = 0 and lifts A pose arms into the T pose. A missing
  required bone throws with the list of missing bones.
- `repairMaterials(root)`: Phong and Lambert to MeshStandardMaterial with a
  roughness from shininess; opaque materials flagged transparent become
  alpha cutouts (teeth and eye sorting); zero opacity over a texture
  becomes a cutout; black base color under a texture becomes white; an
  alpha map that repeats the color map is dropped; failed maps are
  dropped; color maps are sRGB; skinned meshes are never frustum culled.
- `TextureIndex` and `managerForFiles(files, modelName)`: lenient texture
  lookup for dropped folders. Backslash paths, any case, copy suffixes
  (`eyes.png.004`), generic words and the model's own name as a prefix are
  ignored; nearer files win ties.
- `Wardrobe.from(root)`: parts per mesh, or per material on merged meshes,
  classified into 17 slots (eyewear, headwear, top, bottom, footwear,
  hair, face, body and so on) by a scored keyword match that includes the
  romanized Japanese names VRoid and Booth models use. Alternate garment
  states (`Shorts_down`, `No_stocking_L`) start hidden. `equip` shows one
  part and hides the rest of its slot; `snapshot` and `restore` save a
  look.
- `ExpressionRig`: VRM presets on a plain model through the rig expression
  table (direct names, VRChat and MMD aliases, ARKit composites, Oculus
  visemes). A morph name found on several meshes drives all of them.
  `@hackbuild/lipsync` writes to it, or to a three-vrm expression manager,
  through the same `setValue(name, weight)`.
- `HeadHider`: first person view. The head bone scales to 0.001 for one
  render and is restored after it, also when the draw throws, so the body
  still shows in mirrors and shadows.
- `checkRedistribution(meta, { modified })`: the licence gate for exporting
  or composing avatars, for VRM 1.0 and 0.x metadata.
- `probeFbx(bytes)`: tells a rigged character from an animation only FBX
  from the first 256 KB.
- `posedBounds(bones)`: framing bounds from the posed skeleton, since
  skinned bounds stay at the rest pose.

## Install

Not published yet. From a clone:

    npm ci && npm run build -w @hackbuild/rig -w @hackbuild/avatar

`@pixiv/three-vrm` (MIT) is an optional peer, needed only for `/vrm`.

## Use

```ts
import { load } from "@hackbuild/avatar";
import { loadAvatar, managerForFiles } from "@hackbuild/avatar/three";
import { vrmHook } from "@hackbuild/avatar/vrm";

await load(); // the rig wasm
const avatar = await loadAvatar(file, { name: file.name, vrm: vrmHook() });
scene.add(avatar.root);
avatar.warnings.forEach((w) => console.info(w)); // "model was in centimeters and was scaled to meters."

avatar.wardrobe.equip(avatar.wardrobe.slot("outerwear")[0]!.id);
avatar.expressions.setValue("happy", 0.4);

function frame(dt: number) {
  avatar.update(dt); // three-vrm update, or morph weights for a plain model
  avatar.head?.render(renderer, scene, firstPersonCamera);
}
```

For a dropped folder, `managerForFiles(new Map(files.map((f) => [f.webkitRelativePath || f.name, f])), "model")`
gives a LoadingManager to pass as `opts.manager`.

`dist/avatar.iife.js` is the single file build (`HackbuildAvatar`, the rig
wasm inlined, `THREE` read from the page). It leaves out `/vrm`; a page
that wants VRM loads three-vrm itself and passes a hook with the same
shape.

## Develop

    npm run build -w @hackbuild/avatar
    npx vitest run packages/avatar

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `npx vitest run packages/avatar` passed 14 of 14 tests
  (counted). Fixtures are GLB files built in memory by the test; no model
  files are read or committed.
- 2026-11-22: a Mixamo named GLB in centimeters, turned 180 degrees, arms
  40 degrees down, loads to the T pose facing +Z with its toes on y = 0
  within 1e-5 m and head height within 1 mm of the reference (computed).
- 2026-11-22: a UAL style GLB in meters loads with no warnings; a two bone
  model fails with the missing bone list.
- 2026-11-22: a VRM 1.0 GLB loads through `@pixiv/three-vrm` 3.5.5 in Node,
  gives its normalized bones by VRM name, and its metadata passes the
  redistribution gate unmodified and fails it modified.
- 2026-11-22: material repair, the texture index, the wardrobe classifier
  (13 names), alternate detection, ARKit expression binding and the head
  hider each have a test.

### Not verified by anything

- No real model file has been loaded: no VRoid VRM, Mixamo export, UAL
  pack or FBX from a store. The FBX path runs through `FBXLoader` and the
  same normalization, untested on a file.
- Nothing has been looked at in a browser. Listed in
  `docs/browser-checks.md`: skinned meshes after the A to T lift, cutout
  materials on hair and lashes, the head hider in a first person camera.
- Scale is applied on a wrapper group, not baked into the vertex and bind
  data, so spring bones of a non VRM model that assume an unscaled root are
  not handled. VRM models are untouched.
- UDIM tile resolution, UV coverage scoring of candidate images, FBX
  Visibility flags, MMD loading and part grafting between models are not
  built.

## Size budget

| file | raw | gzip |
|---|---|---|
| `avatar.iife.js` (GLTFLoader, FBXLoader and the rig wasm inlined) | 463,293 bytes | 146,756 bytes |

Measured 2026-11-22. No budget set yet.

## Licence

Code MIT (`LICENSE` at the repository root). This README is CC-BY-4.0, its
code samples also MIT.
