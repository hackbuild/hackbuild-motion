# @hackbuild/environment

Brightly lit scenes around a character standing at the origin and facing
+Z, the normalized humanoid space of this repository. A scene is a layout
as data: a key light that casts the character's shadow, a rim light, image
light from an HDRI or from the three.js room environment, a backdrop, an
optional ground disk and fog, and a set assembled from kit models. The
package bundles no HDRI and no model; the caller's resolver gives the
files, from a drop or from URLs.

The main entry has no three.js:

- `PRESETS` and `presetOf(id)`: `studio`, `room`, `cafe`, `outdoors`.
  The studio needs no file. The other three draw from the Kenney Furniture
  and Nature kits (CC0, vendor) under Poly Haven HDRIs (CC0, vendor); each
  preset carries its HDRI path, licence and source for the credit line.
- `needsOf(preset)` and `missingFor(preset, have)`: the files a preset
  needs, so a page can show a scene as off until its files are present.
- `MissingFileError`: "environment: could not load kenney-furniture/wall.glb.
  drop the file or pick the studio.", with `file`.
- `direction(azimuth, elevation)`, `brightestAzimuth(data, w, h)` (the
  brightest spot above the horizon of an equirect image after a five tap
  blur, so a lone hot pixel does not win), `normalizeProbe(coefficients,
  saturation)` (spherical harmonics to an average radiance of 1, pulled
  toward grey, because toon materials shade from direct light and probes).

`/three`:

- `loadEnvironment(preset | id, scene, renderer, { resolve })`: loads
  fully before `attach()`, so the previous scene stays on screen until the
  next is ready. The HDRI is turned so its brightest point sits behind the
  key light. `dispose()` clears only the scene fields that are still its
  own and restores the tone mapping and exposure it found.
- `buildRig(layout)`: key light with a 1024 px shadow map whose camera
  spans 1.6 m to each side of the spot, and a rim light (vendor figures).
- `assemble(items, scale, load)`: every mesh of the set baked into world
  space and merged with the others of the same look, so a room draws in a
  couple of dozen calls; kit materials forced non metallic; source
  geometries freed. A model `load` cannot give rejects with
  `MissingFileError`.
- `modelLoader(resolve)`, `loadHdri(resolve, file)`, `probeFrom(renderer,
  scene, intensity, saturation)`, `buildGround(ground)`.

## Install

Not published yet. From a clone:

    npm ci && npm run build -w @hackbuild/environment

## Use

```ts
import { loadEnvironment } from "@hackbuild/environment/three";
import { missingFor, presetOf } from "@hackbuild/environment";

const files = new Map(dropped.map((f) => [f.path, f.file])); // your own drop
const room = presetOf("room")!;
if (missingFor(room, (p) => files.has(p)).length === 0) {
  const env = await loadEnvironment(room, scene, renderer, { resolve: (p) => files.get(p) ?? null });
  env.attach();
}
```

`@hackbuild/avatar-host` holds the environment slot: a ticketed swap that
imports this package on first use.

`dist/environment.iife.js` is the single file build (`HackbuildEnvironment`,
`THREE` read from the page).

## Develop

    npm run build -w @hackbuild/environment
    npx vitest run packages/environment

## What is verified, and what is not

### Verified on this machine

- 2026-11-24: `npx vitest run packages/environment` passed 8 of 8 tests
  (counted): the studio needs no file and the room lists its HDRI and kit
  models once each; the missing file copy; light directions; the brightest
  azimuth of a synthetic equirect with one bright patch, past a lone hot
  pixel and a brighter spot below the horizon; a probe normalized to mean
  radiance 1 within 1e-9 and pulled to grey; the key light's shadow map and
  extent; a 3 by 3 grid of one kit tile assembled into one mesh per
  material with its source geometries freed; a missing kit model rejects
  with its file name.

### Not verified by anything

- `loadEnvironment`, `probeFrom` and `loadHdri` need a WebGL renderer and
  have not run in a test. The studio in a browser is a row of
  `docs/browser-checks.md`.
- No room, cafe or outdoors scene has been drawn here: their kit models and
  HDRIs are not in this repository. Light figures and the four layouts come
  from earlier work checked by screenshot on a VRM (vendor).
- Shadow quality, draw call counts of a real room and the frame cost on a
  phone are unknown.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 3,088 bytes | 3,242 bytes |
| `dist/environment.iife.js` (single file build) | 34,995 bytes | 36,744 bytes |

Measured 2026-11-24 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

## Licence

Code MIT (`LICENSE` in this package and at the repository root). This
README is CC-BY-4.0, its code samples also MIT. The scene data names CC0
assets the package never bundles.
