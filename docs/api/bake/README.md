# @hackbuild/bake

## Interfaces

### AssetEntry

One row of assets.lock.json: path, source, licence, SHA-256, bytes and an optional budget.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-budget"></a> `budget?` | `number` |
| <a id="property-bytes"></a> `bytes` | `number` |
| <a id="property-licence"></a> `licence` | `string` |
| <a id="property-path"></a> `path` | `string` |
| <a id="property-sha256"></a> `sha256` | `string` |
| <a id="property-source"></a> `source` | `string` |

***

### BakeInput

Everything `bakeClips` takes: frame rate, skeleton, clips, contact rule and seam limit.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-clips"></a> `clips` | [`SourceClip`](#sourceclip)[] |
| <a id="property-contacts"></a> `contacts?` | [`ContactRule`](#contactrule) |
| <a id="property-fps"></a> `fps` | `number` |
| <a id="property-seamlimitdeg"></a> `seamLimitDeg?` | `number` |
| <a id="property-skeleton"></a> `skeleton` | [`Skeleton`](#skeleton) |

***

### ClipPack

A decoded clip pack: frame rate, roles, parents, feet and clips by name.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-clips-1"></a> `clips` | `Record`\<`string`, [`PackedClip`](#packedclip)\> |
| <a id="property-feet"></a> `feet` | `string`[] |
| <a id="property-fps-1"></a> `fps` | `number` |
| <a id="property-parents"></a> `parents` | `number`[] |
| <a id="property-roles"></a> `roles` | `string`[] |

***

### ClipReport

Quantization error, seam and contacts of one baked clip.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-contactframes"></a> `contactFrames` | `number`[] |
| <a id="property-frames"></a> `frames` | `number` |
| <a id="property-largeststepdeg"></a> `largestStepDeg` | `number` \| `null` |
| <a id="property-maxangleerrordeg"></a> `maxAngleErrorDeg` | `number` |
| <a id="property-maxpositionerrorm"></a> `maxPositionErrorM` | `number` |
| <a id="property-name"></a> `name` | `string` |
| <a id="property-seamangledeg"></a> `seamAngleDeg` | `number` \| `null` |
| <a id="property-seamok"></a> `seamOk` | `boolean` \| `null` |
| <a id="property-worstframe"></a> `worstFrame` | `number` |
| <a id="property-worstrole"></a> `worstRole` | `string` |

***

### ContactRule

How foot contacts are found: foot roles, height and speed limits and the shortest contact.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-feet-1"></a> `feet` | `string`[] |
| <a id="property-height"></a> `height` | `number` |
| <a id="property-minframes"></a> `minFrames` | `number` |
| <a id="property-speed"></a> `speed` | `number` |

***

### OptimizeOptions

Options of `optimizeModel`: simplification, texture limits and the resize hook.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-error"></a> `error?` | `number` | Largest simplification error relative to the mesh extent. Default 0.01. |
| <a id="property-lockborder"></a> `lockBorder?` | `boolean` | Keep open borders fixed while simplifying. Default true. |
| <a id="property-ratio"></a> `ratio?` | `number` | Share of triangles to keep, 0 to 1. Default 1, no simplification. |
| <a id="property-resize"></a> `resize?` | [`TextureHook`](#texturehook) | Called for each embedded image; without it textures pass through. |
| <a id="property-textures"></a> `textures?` | `Partial`\<`Record`\<[`TextureRole`](#texturerole), `number`\>\> | Longest side per role in pixels, passed to the hook as `maxSize`. |

***

### OptimizeReport

What `optimizeModel` changed: bytes, vertices, triangles, textures and skipped primitives.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-bytesin"></a> `bytesIn` | `number` | - |
| <a id="property-bytesout"></a> `bytesOut` | `number` | - |
| <a id="property-primitives"></a> `primitives` | `number` | - |
| <a id="property-skipped"></a> `skipped` | `string`[] | Primitives left as they were, with the reason. |
| <a id="property-textures-1"></a> `textures` | `object`[] | - |
| <a id="property-trianglesin"></a> `trianglesIn` | `number` | - |
| <a id="property-trianglesout"></a> `trianglesOut` | `number` | - |
| <a id="property-verticesin"></a> `verticesIn` | `number` | - |
| <a id="property-verticesout"></a> `verticesOut` | `number` | - |

***

### PackedClip

One clip in a pack: int16 rotations and root positions and a contact byte per frame.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-contacts-1"></a> `contacts` | `Uint8Array` | One byte per frame, bit k set while foot k is down. |
| <a id="property-dur"></a> `dur` | `number` | Time of the last frame, (n - 1) / fps. |
| <a id="property-loop"></a> `loop` | `boolean` | - |
| <a id="property-n"></a> `n` | `number` | - |
| <a id="property-name-1"></a> `name` | `string` | - |
| <a id="property-p"></a> `p` | `Int16Array` | int16 root position, value times posScale meters. |
| <a id="property-posscale"></a> `posScale` | `number` | - |
| <a id="property-q"></a> `q` | `Int16Array` | int16 quaternion components, value / 32767, frame major then role. |

***

### Skeleton

The rig of a clip set: role names, parents and rest translations.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-parents-1"></a> `parents` | `number`[] | Parent index per role, -1 for the root; parents come first. |
| <a id="property-rest"></a> `rest` | \[`number`, `number`, `number`\][] | Rest local translation per role in meters. |
| <a id="property-roles-1"></a> `roles` | `string`[] | - |

***

### SourceClip

One clip to bake: name, loop flag, local rotations and optional root translation.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-loop-1"></a> `loop?` | `boolean` | - |
| <a id="property-name-2"></a> `name` | `string` | - |
| <a id="property-p-1"></a> `p?` | `ArrayLike`\<`number`\> | Root local translation per frame; omit for the rest offset. |
| <a id="property-q-1"></a> `q` | `ArrayLike`\<`number`\> | Local rotations, frame major then role, `x y z w`. |

***

### TextureInfo

One embedded image of a GLB: index, role, mime type, size and pixel dimensions.

#### Extended by

- [`TextureRequest`](#texturerequest)

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-bytes-1"></a> `bytes` | `number` | - |
| <a id="property-height-1"></a> `height` | `number` \| `null` | - |
| <a id="property-image"></a> `image` | `number` | - |
| <a id="property-mime"></a> `mime` | `string` | - |
| <a id="property-role"></a> `role` | [`TextureRole`](#texturerole) | - |
| <a id="property-width"></a> `width` | `number` \| `null` | From the PNG or JPEG header; null for other formats. |

***

### TextureRequest

What the texture hook gets: the image facts, its bytes and its size limit.

#### Extends

- [`TextureInfo`](#textureinfo)

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-bytes-2"></a> `bytes` | `number` | - | [`TextureInfo`](#textureinfo).[`bytes`](#property-bytes-1) |
| <a id="property-data"></a> `data` | `Uint8Array` | - | - |
| <a id="property-height-2"></a> `height` | `number` \| `null` | - | [`TextureInfo`](#textureinfo).[`height`](#property-height-1) |
| <a id="property-image-1"></a> `image` | `number` | - | [`TextureInfo`](#textureinfo).[`image`](#property-image) |
| <a id="property-maxsize"></a> `maxSize` | `number` | The limit for this role in pixels, 0 when none was set. | - |
| <a id="property-mime-1"></a> `mime` | `string` | - | [`TextureInfo`](#textureinfo).[`mime`](#property-mime) |
| <a id="property-role-1"></a> `role` | [`TextureRole`](#texturerole) | - | [`TextureInfo`](#textureinfo).[`role`](#property-role) |
| <a id="property-width-1"></a> `width` | `number` \| `null` | From the PNG or JPEG header; null for other formats. | [`TextureInfo`](#textureinfo).[`width`](#property-width) |

## Type Aliases

### TextureHook

```ts
type TextureHook = (t) => 
  | Promise<
  | {
  bytes: Uint8Array;
  mime: string;
}
  | null>
  | {
  bytes: Uint8Array;
  mime: string;
}
  | null;
```

Returns new bytes and their mime type, or null to keep the image.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `t` | [`TextureRequest`](#texturerequest) |

#### Returns

  \| `Promise`\<
  \| \{
  `bytes`: `Uint8Array`;
  `mime`: `string`;
\}
  \| `null`\>
  \| \{
  `bytes`: `Uint8Array`;
  `mime`: `string`;
\}
  \| `null`

***

### TextureRole

```ts
type TextureRole = "baseColor" | "emissive" | "normal" | "orm" | "other";
```

What a texture does in its material, which picks its size limit.

***

### WasmSource

```ts
type WasmSource = 
  | URL
  | string
  | Response
  | ArrayBuffer
  | ArrayBufferView
  | WebAssembly.Module;
```

Where the wasm core comes from: a URL to fetch, a Response, bytes or a compiled module.

## Functions

### bakeClips()

```ts
function bakeClips(input): object;
```

Bakes clips into the compact HBCP pack and reports error, seams and contacts per clip.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `input` | [`BakeInput`](#bakeinput) |

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `bytes` | `Uint8Array` |
| `pack` | [`ClipPack`](#clippack) |
| `report` | [`ClipReport`](#clipreport)[] |

***

### checkLock()

```ts
function checkLock(
   lockText, 
   files, 
   forbid?
): object;
```

Checks files against assets.lock.json: hashes, sizes, budgets, missing licences and licences matching a forbidden substring such as "NC".

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `lockText` | `string` | `undefined` |
| `files` | \| `Map`\<`string`, `Uint8Array`\<`ArrayBufferLike`\>\> \| `Record`\<`string`, `Uint8Array`\<`ArrayBufferLike`\>\> | `undefined` |
| `forbid?` | `string`[] | `[]` |

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `failures` | `string`[] |
| `ok` | `boolean` |

***

### decodePack()

```ts
function decodePack(buf): ClipPack;
```

Reads the HBCP pack format; no wasm needed.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `buf` | `ArrayBuffer` \| `ArrayBufferView`\<`ArrayBufferLike`\> |

#### Returns

[`ClipPack`](#clippack)

***

### goldenTrace()

```ts
function goldenTrace(seed): Float64Array;
```

A deterministic trace of the core for one seed, compared between the native and wasm builds in tests.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `seed` | `number` |

#### Returns

`Float64Array`

***

### listTextures()

```ts
function listTextures(glb): TextureInfo[];
```

Lists the embedded images of a GLB with their roles and sizes.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `glb` | `ArrayBuffer` \| `ArrayBufferView`\<`ArrayBufferLike`\> |

#### Returns

[`TextureInfo`](#textureinfo)[]

***

### load()

```ts
function load(source?): Promise<void>;
```

Loads the wasm core once: from a URL, bytes or a compiled module, or from the inlined copy when you pass nothing. Call it before anything else.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `source?` | [`WasmSource`](#wasmsource) |

#### Returns

`Promise`\<`void`\>

***

### loadSync()

```ts
function loadSync(source): void;
```

Loads the wasm core synchronously from bytes or a compiled module.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `source` | `ArrayBuffer` \| `Module` \| `ArrayBufferView`\<`ArrayBufferLike`\> |

#### Returns

`void`

***

### lockEntry()

```ts
function lockEntry(
   path, 
   bytes, 
   source, 
   licence, 
   budget?
): AssetEntry;
```

A lock row for one file, with its SHA-256 and byte count measured from the bytes.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `path` | `string` |
| `bytes` | `ArrayBuffer` \| `ArrayBufferView`\<`ArrayBufferLike`\> |
| `source` | `string` |
| `licence` | `string` |
| `budget?` | `number` |

#### Returns

[`AssetEntry`](#assetentry)

***

### optimizeModel()

```ts
function optimizeModel(glb, opts?): Promise<{
  glb: Uint8Array;
  report: OptimizeReport;
}>;
```

Welds, simplifies and repacks a GLB, swapping in the images your resize hook returns.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `glb` | `ArrayBuffer` \| `ArrayBufferView`\<`ArrayBufferLike`\> |
| `opts?` | [`OptimizeOptions`](#optimizeoptions) |

#### Returns

`Promise`\<\{
  `glb`: `Uint8Array`;
  `report`: [`OptimizeReport`](#optimizereport);
\}\>

***

### sampleClip()

```ts
function sampleClip(
   pack, 
   clip, 
   t, 
   out
): [number, number, number];
```

Samples a packed clip at time `t` seconds into `out` (roles times 4
quaternion components) with normalized linear blending between frames.
Loop clips wrap, others clamp. Returns the root position in meters.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `pack` | [`ClipPack`](#clippack) |
| `clip` | [`PackedClip`](#packedclip) |
| `t` | `number` |
| `out` | `Float32Array` |

#### Returns

\[`number`, `number`, `number`\]

***

### sha256Hex()

```ts
function sha256Hex(bytes): string;
```

The SHA-256 of bytes as lowercase hex, computed in the wasm core.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `bytes` | `ArrayBuffer` \| `ArrayBufferView`\<`ArrayBufferLike`\> |

#### Returns

`string`

***

### syntheticClips()

```ts
function syntheticClips(seed): BakeInput;
```

A walk loop, a broken loop and a one shot on an eight role leg rig.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `seed` | `number` |

#### Returns

[`BakeInput`](#bakeinput)

***

### syntheticGlb()

```ts
function syntheticGlb(seed, grid): Uint8Array;
```

A bumpy unindexed grid GLB with a line mesh and a fake 2048 px PNG.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `seed` | `number` |
| `grid` | `number` |

#### Returns

`Uint8Array`

***

### writeLock()

```ts
function writeLock(entries): string;
```

assets.lock.json text, sorted by path.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entries` | [`AssetEntry`](#assetentry)[] |

#### Returns

`string`
