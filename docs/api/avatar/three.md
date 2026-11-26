# three

## Classes

### ExpressionRig

VRM presets on a plain model through the rig expression table: each
preset resolves once to morphs, and every mesh that carries a morph name
joins, so a face split from its lashes blinks as one. Weights set during
a frame add up and clamp to 1 when `apply` runs.

#### Implements

- [`ExpressionSink`](#expressionsink)

#### Constructors

##### Constructor

```ts
new ExpressionRig(root): ExpressionRig;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `root` | `Object3D` |

###### Returns

[`ExpressionRig`](#expressionrig)

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-found"></a> `found` | `readonly` | `Partial`\<`Record`\<`VrmExpression`, `ResolvedExpression`\>\> |

#### Accessors

##### morphNames

###### Get Signature

```ts
get morphNames(): string[];
```

###### Returns

`string`[]

#### Methods

##### apply()

```ts
apply(): void;
```

Writes the frame's weights into morph influences.

###### Returns

`void`

##### getValue()

```ts
getValue(name): number;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |

###### Returns

`number`

##### reset()

```ts
reset(): void;
```

###### Returns

`void`

##### setValue()

```ts
setValue(name, weight): void;
```

Sets a VRM preset, or a raw morph name when no preset has that name.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |
| `weight` | `number` |

###### Returns

`void`

###### Implementation of

[`ExpressionSink`](#expressionsink).[`setValue`](#setvalue-1)

***

### HeadHider

Hides the head for a first person render by scaling the head bone to
0.001 for that render only, then restores it. Hair, hats and glasses
parented or skinned to the head go with it; the body still casts its
shadow in the other renders.

#### Constructors

##### Constructor

```ts
new HeadHider(head, scale?): HeadHider;
```

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `head` | `Object3D` | `undefined` |
| `scale?` | `number` | `0.001` |

###### Returns

[`HeadHider`](#headhider)

#### Properties

| Property | Modifier | Type | Default value |
| ------ | ------ | ------ | ------ |
| <a id="property-head"></a> `head` | `readonly` | `Object3D` | `undefined` |
| <a id="property-scale"></a> `scale` | `readonly` | `number` | `0.001` |

#### Methods

##### during()

```ts
during<T>(draw): T;
```

Runs `draw` with the head hidden and restores it even when `draw` throws.

###### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `draw` | () => `T` |

###### Returns

`T`

##### hide()

```ts
hide(): void;
```

###### Returns

`void`

##### render()

```ts
render(
   renderer, 
   scene, 
   camera
): void;
```

One render of `scene` from `camera` without the head.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `renderer` | \{ `render`(`scene`, `camera`): `void`; \} |
| `renderer.render` | (`scene`, `camera`) => `void` |
| `scene` | `Scene` |
| `camera` | `Camera` |

###### Returns

`void`

##### restore()

```ts
restore(): void;
```

###### Returns

`void`

***

### Wardrobe

Parts per mesh, or per material when one mesh carries several named
materials (merged MMD style meshes). Alternate garment states start
hidden. Slots hold several parts; `equip` shows one and hides the rest of
its slot.

#### Constructors

##### Constructor

```ts
new Wardrobe(): Wardrobe;
```

###### Returns

[`Wardrobe`](#wardrobe)

#### Properties

| Property | Modifier | Type | Default value |
| ------ | ------ | ------ | ------ |
| <a id="property-parts"></a> `parts` | `readonly` | [`Part`](#part)[] | `[]` |

#### Methods

##### equip()

```ts
equip(id): void;
```

Shows a part and hides the other parts in its slot.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

###### Returns

`void`

##### get()

```ts
get(id): Part | undefined;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

###### Returns

[`Part`](#part) \| `undefined`

##### restore()

```ts
restore(s): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `s` | `Record`\<`string`, `boolean`\> |

###### Returns

`void`

##### setVisible()

```ts
setVisible(id, on): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |
| `on` | `boolean` |

###### Returns

`void`

##### slot()

```ts
slot(label): Part[];
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `label` | \| `"neck"` \| `"eyewear"` \| `"headwear"` \| `"hairAccessory"` \| `"ear"` \| `"hand"` \| `"prop"` \| `"outerwear"` \| `"onepiece"` \| `"top"` \| `"bottom"` \| `"legwear"` \| `"footwear"` \| `"underwear"` \| `"hair"` \| `"face"` \| `"body"` |

###### Returns

[`Part`](#part)[]

##### snapshot()

```ts
snapshot(): Record<string, boolean>;
```

###### Returns

`Record`\<`string`, `boolean`\>

##### toggle()

```ts
toggle(id): boolean;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

###### Returns

`boolean`

##### from()

```ts
static from(root): Wardrobe;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `root` | `Object3D` |

###### Returns

[`Wardrobe`](#wardrobe)

## Interfaces

### Avatar

A loaded character in the normalized humanoid space: root, bones, wardrobe, expressions, clips and metadata.

#### Extended by

- [`MmdAvatar`](mmd.md#mmdavatar)

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-animations"></a> `animations` | `AnimationClip`[] | - |
| <a id="property-bones"></a> `bones` | `Partial`\<`Record`\<[`HumanBone`](index.md#humanbone), `Object3D`\>\> | - |
| <a id="property-dialect"></a> `dialect` | `string` | Rig family the mapper saw: mixamo, unreal (UAL), vroid and so on. |
| <a id="property-expressions"></a> `expressions` | [`ExpressionSink`](#expressionsink) & `Partial`\<`Pick`\<[`ExpressionRig`](#expressionrig), `"apply"` \| `"reset"` \| `"found"`\>\> | - |
| <a id="property-format"></a> `format` | [`AvatarFormat`](index.md#avatarformat) | - |
| <a id="property-head-1"></a> `head` | [`HeadHider`](#headhider) \| `null` | - |
| <a id="property-humanoid"></a> `humanoid` | [`Humanoid`](#humanoid) \| `null` | - |
| <a id="property-repair"></a> `repair` | [`RepairReport`](#repairreport) \| `null` | - |
| <a id="property-root"></a> `root` | `Object3D` | - |
| <a id="property-vrm"></a> `vrm` | [`VrmResult`](#vrmresult) \| `null` | - |
| <a id="property-wardrobe"></a> `wardrobe` | [`Wardrobe`](#wardrobe) | - |
| <a id="property-warnings"></a> `warnings` | `string`[] | - |

#### Methods

##### dispose()

```ts
dispose(): void;
```

Takes the body out of its parent and frees its geometry, materials, maps and bone textures.

###### Returns

`void`

##### update()

```ts
update(dt): void;
```

Call once per frame after the pose is written.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `dt` | `number` |

###### Returns

`void`

***

### ExpressionSink

What a face driver writes to: a preset or morph name and a weight.

#### Methods

##### setValue()

```ts
setValue(name, weight): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |
| `weight` | `number` |

###### Returns

`void`

***

### FileTextures

A loading manager over dropped files that resolves texture references through a `TextureIndex`, with the references it could not match.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-index"></a> `index` | [`TextureIndex`](index.md#textureindex) | - |
| <a id="property-manager"></a> `manager` | `LoadingManager` | - |
| <a id="property-misses"></a> `misses` | `string`[] | References no dropped file matched. |

#### Methods

##### dispose()

```ts
dispose(): void;
```

###### Returns

`void`

##### texture()

```ts
texture(file): Texture;
```

One texture per file, shared by every material that shows it; `userData.file` and `userData.ready` set.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `file` | `string` |

###### Returns

`Texture`

***

### Humanoid

A model placed in the normalized humanoid space: its root group, mapped bones, rig and rest reports and head height.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-bones-1"></a> `bones` | `Partial`\<`Record`\<[`HumanBone`](index.md#humanbone), `Object3D`\>\> | - |
| <a id="property-headheight"></a> `headHeight` | `number` | Head joint height above the floor after normalizing, meters (measured). |
| <a id="property-model"></a> `model` | `Object3D` | - |
| <a id="property-report"></a> `report` | `RigMapReport` | - |
| <a id="property-rest"></a> `rest` | `RestReport` | - |
| <a id="property-root-1"></a> `root` | `Group` | Group that holds the model in the normalized space. |

***

### ImageSample

A small copy of an image and its background color (the commonest color along its border).

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-background"></a> `background` | \[`number`, `number`, `number`\] |
| <a id="property-pixels"></a> `pixels` | `Uint8ClampedArray` |
| <a id="property-size"></a> `size` | `number` |

***

### LoadOptions

Name, resource path, manager, dropped textures, VRM hook, repair and normalize options of `loadAvatar`.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-files"></a> `files?` | [`FileTextures`](#filetextures) | From `managerForFiles`: its manager is used, and missing color maps are filled from the dropped files. |
| <a id="property-manager-1"></a> `manager?` | `LoadingManager` | - |
| <a id="property-name"></a> `name?` | `string` | File name, used to sniff when the bytes say nothing and to clean texture names. |
| <a id="property-normalize"></a> `normalize?` | [`NormalizeOptions`](#normalizeoptions) | - |
| <a id="property-path"></a> `path?` | `string` | Resource path for relative references. |
| <a id="property-repair-1"></a> `repair?` | `false` \| [`RepairOptions`](#repairoptions) | - |
| <a id="property-vrm-1"></a> `vrm?` | [`VrmHook`](#vrmhook) | From `@hackbuild/avatar/vrm`; without it a VRM loads as plain glTF. |

***

### MapSources

Where `pickMap` looks for a material's color map: its own map, a file named like it, and image samples.

#### Methods

##### byName()

```ts
byName(name): string | null;
```

The file named like a material, or null.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |

###### Returns

`string` \| `null`

##### own()

```ts
own(m): string | null;
```

The file a material's own map came from, or null when it has none.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `m` | `Material` |

###### Returns

`string` \| `null`

##### sample()

```ts
sample(file): Promise<ImageSample | null>;
```

A sample of a file's image, or null when it cannot be read.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `file` | `string` |

###### Returns

`Promise`\<[`ImageSample`](#imagesample) \| `null`\>

***

### NormalizeOptions

Head height, T pose arms, straight legs and unit options for placing a model in the normalized humanoid space.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-deform"></a> `deform?` | `boolean` | Map the MMD D deform leg bones, the ones most models skin to, in place of the plain ones. |
| <a id="property-headheight-1"></a> `headHeight?` | `number` | Head joint height in meters; default keeps the measured size. |
| <a id="property-straightlegs"></a> `straightLegs?` | `boolean` | Straighten splayed legs. Default false. |
| <a id="property-tposearms"></a> `tPoseArms?` | `boolean` | Lift A pose arms to the T pose. Default true. |
| <a id="property-unit"></a> `unit?` | `number` | Meters per model unit when the format fixes it (MMD: 0.08); overrides the unit guess. |

***

### Part

One wardrobe part: its slot, group, meshes and, for a merged mesh, its material.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-group"></a> `group` | [`PartGroup`](index.md#partgroup) \| `"other"` | - |
| <a id="property-id"></a> `id` | `string` | - |
| <a id="property-label"></a> `label` | \| `"neck"` \| `"eyewear"` \| `"headwear"` \| `"hairAccessory"` \| `"ear"` \| `"hand"` \| `"prop"` \| `"outerwear"` \| `"onepiece"` \| `"top"` \| `"bottom"` \| `"legwear"` \| `"footwear"` \| `"underwear"` \| `"hair"` \| `"face"` \| `"body"` \| `null` | - |
| <a id="property-material"></a> `material?` | `Material`\<`MaterialEventMap`\> | Set when the part is one material of a merged mesh. |
| <a id="property-meshes"></a> `meshes` | `Mesh`\<`BufferGeometry`\<`NormalBufferAttributes`, `BufferGeometryEventMap`\>, `Material`\<`MaterialEventMap`\> \| `Material`\<`MaterialEventMap`\>[], `Object3DEventMap`\>[] | Meshes the toggle shows and hides. |
| <a id="property-name-1"></a> `name` | `string` | - |
| <a id="property-visible"></a> `visible` | `boolean` | - |

***

### PickedMap

The image file chosen for a material and the rule that chose it.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-file"></a> `file` | `string` |
| <a id="property-via"></a> `via` | [`MapVia`](#mapvia) |

***

### RepairOptions

Alpha cutoff, double sided faces and the broken texture test of the material repair.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-cutoff"></a> `cutoff?` | `number` | Alpha cutoff for materials turned into cutouts. Default 0.5. |
| <a id="property-doublesided"></a> `doubleSided?` | `boolean` \| ((`mesh`) => `boolean`) | Render both faces for meshes whose name passes, or for all when true. |
| <a id="property-isbroken"></a> `isBroken?` | (`t`) => `boolean` | A texture whose image failed; default checks for a finished image of zero width. |

***

### RepairReport

What the material repair changed, counted per kind.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-bycoverage"></a> `byCoverage` | `number` | Missing color maps filled from the image that covers the material's UVs best. |
| <a id="property-byname"></a> `byName` | `number` | Missing color maps filled from a dropped file named like the material. |
| <a id="property-bytile"></a> `byTile` | `number` | Missing color maps filled from the file that owns the material's UV tile. |
| <a id="property-colorspace"></a> `colorSpace` | `number` | Color maps set to sRGB. |
| <a id="property-converted"></a> `converted` | `number` | Phong and Lambert materials replaced by MeshStandardMaterial. |
| <a id="property-cutouts"></a> `cutouts` | `number` | Materials turned into alpha cutouts. |
| <a id="property-droppedmaps"></a> `droppedMaps` | `number` | Duplicate alpha maps and failed maps removed. |
| <a id="property-misses-1"></a> `misses` | `string`[] | Texture references and materials no file was found for. |
| <a id="property-whitened"></a> `whitened` | `number` | Black base colors under a texture reset to white. |

***

### TileGroup

A material's share of a mesh: the UV tile it lies in and how many vertices use it.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-m"></a> `M` |

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-material-1"></a> `material` | `M` | - |
| <a id="property-tile"></a> `tile` | `string` \| `null` | "u,v" of the unit cell the group's UVs lie in, or null when they span more than one. |
| <a id="property-weight"></a> `weight` | `number` | Vertex references in the group, to choose among several files. |

***

### VrmHook

What `/vrm` hands to `loadAvatar` so VRM files load through @pixiv/three-vrm.

#### Methods

##### finish()

```ts
finish(gltf): VrmResult | null;
```

Returns null when the file carried no VRM after all.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `gltf` | `GLTF` |

###### Returns

[`VrmResult`](#vrmresult) \| `null`

##### register()

```ts
register(loader): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `loader` | `GLTFLoader` |

###### Returns

`void`

***

### VrmResult

A VRM as the loader hands it back: root, bones, expressions, the per frame update and the VRM metadata.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-bones-2"></a> `bones` | `Partial`\<`Record`\<[`HumanBone`](index.md#humanbone), `Object3D`\>\> |
| <a id="property-expressions-1"></a> `expressions` | [`ExpressionSink`](#expressionsink) |
| <a id="property-meta"></a> `meta` | `unknown` |
| <a id="property-root-2"></a> `root` | `Object3D` |
| <a id="property-vrm-2"></a> `vrm` | `unknown` |

#### Methods

##### update()

```ts
update(dt): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `dt` | `number` |

###### Returns

`void`

## Type Aliases

### AvatarSource

```ts
type AvatarSource = string | URL | ArrayBuffer | ArrayBufferView | Blob;
```

What `loadAvatar` reads: a URL, bytes or a file.

***

### MapVia

```ts
type MapVia = "tile" | "name" | "coverage";
```

The rule that picked a color map: UV tile, material name or coverage.

## Variables

### SAMPLE\_SIZE

```ts
const SAMPLE_SIZE: 128 = 128;
```

Side of the copy an image is sampled from, pixels.

***

### SIBLING\_MIN

```ts
const SIBLING_MIN: 0.6 = 0.6;
```

Least coverage for a sibling's image to be taken (vendor).

## Functions

### applyStartingVisibility()

```ts
function applyStartingVisibility(root, hidden): number;
```

Hides the meshes an FBX file stores switched off (`hiddenInFile`), before the wardrobe reads visibility.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `root` | `Object3D` |
| `hidden` | `ReadonlySet`\<`string`\> |

#### Returns

`number`

***

### bakeScale()

```ts
function bakeScale(root, s): void;
```

Scales `root` and everything under it by `s` in place; the root keeps scale 1.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `root` | `Object3D` |
| `s` | `number` |

#### Returns

`void`

***

### coverage()

```ts
function coverage(img, uvs): number;
```

Share of UV centers on painted pixels. Textures are flipped on upload, so v = 0 is the bottom row.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `img` | [`ImageSample`](#imagesample) |
| `uvs` | `Float32Array` |

#### Returns

`number`

***

### disposeObject()

```ts
function disposeObject(root): void;
```

Frees every geometry, material, texture and skeleton under `root` and detaches it.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `root` | `Object3D` |

#### Returns

`void`

***

### fillMaps()

```ts
function fillMaps(
   root, 
   files, 
   report
): Promise<void>;
```

Drops color maps that failed and fills missing ones from the dropped
files: the material's UV tile, then its name, then a sibling's image that
covers its UVs (see `pickMaps`). Waits for every map to settle. Counts go
into `report`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `root` | `Object3D` |
| `files` | `Pick`\<[`FileTextures`](#filetextures), `"index"` \| `"texture"`\> |
| `report` | [`RepairReport`](#repairreport) |

#### Returns

`Promise`\<`void`\>

***

### loadAvatar()

```ts
function loadAvatar(src, opts?): Promise<Avatar>;
```

Loads a character from a URL, bytes or a dropped File: VRM through the
`/vrm` hook when given, glTF and GLB (Mixamo, UAL, generic) and FBX
through the three.js loaders. Non VRM models are repaired and wrapped
into the normalized humanoid space. Needs the rig wasm: `await load()`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `src` | [`AvatarSource`](#avatarsource) |
| `opts?` | [`LoadOptions`](#loadoptions) |

#### Returns

`Promise`\<[`Avatar`](#avatar)\>

***

### managerForFiles()

```ts
function managerForFiles(files, modelName?): FileTextures;
```

A LoadingManager that sends every texture reference through a lenient
index of the files the person dropped, so wrong paths in the model still
find their images. `files` maps relative path to a Blob or a URL. Every
image an FBX asks for goes through a picking loader whose textures carry
`userData.ready` and `userData.file`, so a failed map can fall back;
TGA files load through TGALoader. Pass the result as `opts.files` to
`loadAvatar` to fill missing color maps.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `files` | `ReadonlyMap`\<`string`, `string` \| `Blob`\> | `undefined` |
| `modelName?` | `string` | `""` |

#### Returns

[`FileTextures`](#filetextures)

***

### normalizeHumanoid()

```ts
function normalizeHumanoid(model, opts?): Humanoid;
```

Maps the model's bones to VRM 1.0 names, bakes its units into the model
(`bakeScale`, so spring bones see an unscaled root), then wraps it so it
faces +Z, stands in meters with its feet on y = 0, and lifts A pose arms into the
T pose. Throws with the missing bone list when a required bone is absent.
Needs the rig wasm: `await load()` first.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `model` | `Object3D` |
| `opts?` | [`NormalizeOptions`](#normalizeoptions) |

#### Returns

[`Humanoid`](#humanoid)

***

### pickMaps()

```ts
function pickMaps(meshes, src): Promise<Map<Material<MaterialEventMap>, PickedMap | null>>;
```

A color map for every material on `meshes` with no own map: its tile's
file, then its name match, then a sibling's image at coverage 0.6 or
more. Several candidates are scored by coverage, one image at a time with
a yield between images. A material with no candidate maps to null.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `meshes` | readonly `Mesh`\<`BufferGeometry`\<`NormalBufferAttributes`, `BufferGeometryEventMap`\>, `Material`\<`MaterialEventMap`\> \| `Material`\<`MaterialEventMap`\>[], `Object3DEventMap`\>[] |
| `src` | [`MapSources`](#mapsources) |

#### Returns

`Promise`\<`Map`\<`Material`\<`MaterialEventMap`\>, [`PickedMap`](#pickedmap) \| `null`\>\>

***

### posedBounds()

```ts
function posedBounds(bones, margin?): Box3;
```

World bounds of the posed skeleton plus a margin, for camera framing; skinned bounds stay at rest size.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `bones` | `Partial`\<`Record`\<[`HumanBone`](index.md#humanbone), `Object3D`\>\> | `undefined` |
| `margin?` | `number` | `0.12` |

#### Returns

`Box3`

***

### readyOf()

```ts
function readyOf(t): Promise<boolean>;
```

Settles true once a texture's image arrived, false when it failed or no file was found.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `t` | `Texture`\<`unknown`, `TextureEventMap`\> \| `null` \| `undefined` |

#### Returns

`Promise`\<`boolean`\>

***

### repairMaterials()

```ts
function repairMaterials(root, opts?): RepairReport;
```

Fixes the exporter errors that make dropped models look wrong: Phong and
Lambert become MeshStandardMaterial; an opaque material flagged
transparent becomes a cutout (teeth and eye sorting); zero opacity over a
texture becomes a cutout (Blender alpha setup); black base color under a
texture becomes white; an alpha map that repeats the color map is
dropped (FBXLoader reads it from the green channel); failed maps are
dropped; color maps are sRGB; skinned meshes are never frustum culled,
since their bounds stay at the rest pose.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `root` | `Object3D` |
| `opts?` | [`RepairOptions`](#repairoptions) |

#### Returns

[`RepairReport`](#repairreport)

***

### resolveTiles()

```ts
function resolveTiles<M>(groups, matched): Map<M, string | null>;
```

The file each tiled group should show, given what its material matched by
name (null for none). Each file gets one owner tile where the claims allow
it; a material whose match belongs to another tile, or that matched
nothing, takes its own tile's file. Empty unless the groups cover two or
more tiles.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-m-1"></a> `M` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `groups` | readonly [`TileGroup`](#tilegroup)\<`M`\>[] |
| `matched` | (`m`) => `string` \| `null` |

#### Returns

`Map`\<`M`, `string` \| `null`\>

***

### roughnessFromShininess()

```ts
function roughnessFromShininess(n): number;
```

Blinn-Phong shininess to a roughness: sqrt(2 / (n + 2)), the usual
Beckmann correspondence (inferred), clamped to 0.15 to 1.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `n` | `number` |

#### Returns

`number`

***

### sampleImage()

```ts
function sampleImage(image): Promise<ImageSample | null>;
```

Samples a loaded image. The resize to 128 px goes through
`createImageBitmap` where the page has it, which lets the browser decode
and scale away from the page's own work (inferred, browser dependent);
the read back uses an OffscreenCanvas. Null where neither exists or the
image cannot be drawn (decoded TGA data); such a candidate scores 0.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `image` | \| `Blob` \| `HTMLImageElement` \| `SVGImageElement` \| `HTMLVideoElement` \| `HTMLCanvasElement` \| `ImageBitmap` \| `OffscreenCanvas` \| `VideoFrame` \| `ImageData` |

#### Returns

`Promise`\<[`ImageSample`](#imagesample) \| `null`\>

***

### samplePixels()

```ts
function samplePixels(pixels, size?): ImageSample;
```

An ImageSample from RGBA pixels of a `size` by `size` copy.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `pixels` | `Uint8ClampedArray` | `undefined` |
| `size?` | `number` | `SAMPLE_SIZE` |

#### Returns

[`ImageSample`](#imagesample)

***

### tileGroups()

```ts
function tileGroups(mesh): TileGroup<Material<MaterialEventMap>>[];
```

Material groups of one mesh with the UV tile each lies in.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `mesh` | `Mesh` |

#### Returns

[`TileGroup`](#tilegroup)\<`Material`\<`MaterialEventMap`\>\>[]

***

### uvCenters()

```ts
function uvCenters(mesh, material): Float32Array;
```

UV centers of the material's triangles on `mesh`, wrapped to 0 to 1 (tiles and repeat wrapping sample one image).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `mesh` | `Mesh` |
| `material` | `Material` |

#### Returns

`Float32Array`
