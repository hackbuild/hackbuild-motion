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
- `normalizeHumanoid(model)`: maps bones with no per rig table, bakes
  centimeter and millimeter units into the model (`bakeScale`), wraps it
  so it faces +Z, stands it on y = 0 and lifts A pose arms into the T pose. A missing
  required bone throws with the list of missing bones.
- `repairMaterials(root)`: Phong and Lambert to MeshStandardMaterial with a
  roughness from shininess; opaque materials flagged transparent become
  alpha cutouts (teeth and eye sorting); zero opacity over a texture
  becomes a cutout; black base color under a texture becomes white; an
  alpha map that repeats the color map is dropped; failed maps are
  dropped; color maps are sRGB; skinned meshes are never frustum culled.
- `bakeScale(root, s)`: units into node positions, vertex and morph
  positions and the translation column of bind and inverse bind matrices,
  so the root and the wrapper group stay at scale 1 and spring bones see
  meters.
- `TextureIndex` and `managerForFiles(files, modelName)`: lenient texture
  lookup for dropped folders. Backslash paths, any case, copy suffixes
  (`eyes.png.004`), generic words and the model's own name as a prefix are
  ignored; nearer files win ties. Words split on Unicode letters and
  digits, so a Japanese file name keeps its key words; MMD sphere maps
  (`.spa`, `.sph`) never match as a color. Every image an FBX asks for
  goes through a picking loader whose textures carry `userData.ready` and
  `userData.file`; TGA loads through TGALoader.
- `fillMaps(root, files, report)`, run by `loadAvatar` when you pass
  `files: managerForFiles(...)`: drops color maps that failed and fills
  missing ones from the dropped files, first the image that owns the
  material's UV tile on a UDIM style mesh (`tileGroups`, `resolveTiles`),
  then an image named like the material, then a sibling material's image
  when it covers at least 0.6 of the material's UVs (`uvCenters`,
  `sampleImage`, `coverage`, `pickMaps`). `RepairReport` counts `byTile`,
  `byName`, `byCoverage` and lists `misses`. Images are sampled one at a
  time at 128 px through `createImageBitmap` with a yield between images.
- `hiddenInFile(bytes)` and `applyStartingVisibility(root, hidden)`: FBX
  meshes the file stores with Visibility 0 or Show false start hidden;
  `loadAvatar` runs both on FBX before the wardrobe reads visibility.
- `toVrm(avatar, { springs })` from `/vrm`: a three-vrm `VRM` around a
  loaded GLB or FBX avatar, with normalized bones at identity rest
  rotations, expressions from the rig expression table, eye bone look at
  limited to 12 degrees sideways and 8 up and down (`EYE_RANGE`, vendor),
  and optional spring bones, so one frame loop drives every format.
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

`avatar.dispose()` takes the body out of the scene and frees its geometry,
materials, maps and bone textures; `repairMaterials` frees the materials it
replaces.

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
- 2026-11-24: `npx vitest run packages/avatar` passed 55 of 55 tests
  (counted), 15 of them in `test/repair.test.ts`: `bakeScale` by 0.01
  leaves skinned vertex world positions equal to the scaled originals
  within 1e-5 and the root at scale 1; a two tile mesh with crossed
  material names gets each tile's own file; a material with no texture
  takes the sibling image that covers its UVs and refuses one under 0.6;
  binary and ASCII FBX fragments with Visibility 0 give the hidden names;
  a missing map resolves `ready` false and is dropped; a Japanese file name
  matches by key words; a `.sph` reference returns null; `toVrm` on a
  Mixamo named GLB gives normalized bones with identity rest rotations
  that drive the raw bones.
- 2026-11-22: material repair, the texture index, the wardrobe classifier
  (13 names), alternate detection, ARKit expression binding and the head
  hider each have a test.

### Not verified by anything

- No real model file has been loaded: no VRoid VRM, Mixamo export, UAL
  pack or FBX from a store. The FBX path, stored visibility, the picking
  loader, tile and coverage fallbacks run on fragments built by the tests,
  untested on a store pack. `sampleImage` needs a browser; in Node it
  returns null and a candidate scores 0. The 0.6 threshold and the eye
  ranges are vendor figures from earlier work, not measured here.
- Nothing has been looked at in a browser. Listed in
  `docs/browser-checks.md`: skinned meshes after the A to T lift, cutout
  materials on hair and lashes, the head hider in a first person camera.
- `toVrm` springs: the option takes a builder; no spring bones are
  derived from a GLB or FBX by this package.
- MMD loading and part grafting between models are not built.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 5,539 bytes | 5,815 bytes |
| `dist/avatar.iife.js` (single file build) | 151,952 bytes | 159,549 bytes |

Measured 2026-11-24 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

## Licence

Code MIT (`LICENSE` at the repository root). This README is CC-BY-4.0, its
code samples also MIT.
