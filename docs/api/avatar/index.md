# index

## Classes

### TextureIndex

Finds the dropped image file a model's texture reference means, by exact path, file name, cleaned stem or key words.

#### Constructors

##### Constructor

```ts
new TextureIndex(files, modelName?): TextureIndex;
```

`files` are paths relative to the model file; `modelName` its file name without extension.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `files` | readonly `string`[] | `undefined` |
| `modelName?` | `string` | `""` |

###### Returns

[`TextureIndex`](#textureindex)

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-files"></a> `files` | `readonly` | `string`[] |

#### Methods

##### forReference()

```ts
forReference(ref): string | null;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ref` | `string` |

###### Returns

`string` \| `null`

##### key()

```ts
key(stem): string;
```

Key words of a stem: generic words and leading model name words dropped.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `stem` | `string` |

###### Returns

`string`

##### match()

```ts
match(ref): TextureMatch | null;
```

The best file for a reference as written in the model, or null.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ref` | `string` |

###### Returns

[`TextureMatch`](#texturematch) \| `null`

## Interfaces

### Category

The wardrobe slot a part name scores best for: group, label and score.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-group"></a> `group` | [`PartGroup`](#partgroup) |
| <a id="property-label"></a> `label` | \| `"neck"` \| `"eyewear"` \| `"headwear"` \| `"hairAccessory"` \| `"ear"` \| `"hand"` \| `"prop"` \| `"outerwear"` \| `"onepiece"` \| `"top"` \| `"bottom"` \| `"legwear"` \| `"footwear"` \| `"underwear"` \| `"hair"` \| `"face"` \| `"body"` |
| <a id="property-score"></a> `score` | `number` |

***

### FbxProbe

What the first 256 KB of an FBX file say: a character, a clip or unknown, and whether it holds geometry and deformers.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-deformer"></a> `deformer` | `boolean` |
| <a id="property-geometry"></a> `geometry` | `boolean` |
| <a id="property-kind"></a> `kind` | `"unknown"` \| `"character"` \| `"clip"` |

***

### RedistributionVerdict

Whether an avatar may go into a shareable bundle, whether the user must confirm, and why not.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-needsconfirm"></a> `needsConfirm?` | `boolean` |
| <a id="property-ok"></a> `ok` | `boolean` |
| <a id="property-reason"></a> `reason?` | `string` |

***

### TextureMatch

One candidate file for a texture reference and how well it matched.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-file"></a> `file` | `string` | - |
| <a id="property-score-1"></a> `score` | `number` | 4 exact path, 3 same file name, 2 same cleaned stem, 1 same key words. |

***

### VrmMetaLike

VRM 1.0 and 0.x metadata fields the gate reads.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-allowredistribution"></a> `allowRedistribution?` | `boolean` |
| <a id="property-licensename"></a> `licenseName?` | `string` |
| <a id="property-metaversion"></a> `metaVersion?` | `string` |
| <a id="property-modification"></a> `modification?` | `string` |
| <a id="property-otherlicenseurl"></a> `otherLicenseUrl?` | `string` |

## Type Aliases

### AvatarFormat

```ts
type AvatarFormat = "vrm" | "vrma" | "glb" | "gltf" | "fbx" | "unknown";
```

The file format an avatar was sniffed as.

***

### HumanBone

```ts
type HumanBone = typeof HUMAN_BONES[number];
```

One VRM 1.0 humanoid bone name.

***

### PartGroup

```ts
type PartGroup = "clothing" | "accessory" | "hair" | "base";
```

The wardrobe group of a part: clothing, accessory, hair or base.

***

### SlotLabel

```ts
type SlotLabel = typeof SLOT_LABELS[number];
```

One wardrobe slot name from `SLOT_LABELS`.

## Variables

### GROUP\_ORDER

```ts
const GROUP_ORDER: readonly PartGroup[];
```

Order for toggle lists: clothing first, base last.

***

### SLOT\_KEYWORDS

```ts
const SLOT_KEYWORDS: Record<SlotLabel, readonly string[]>;
```

Keywords per slot, including the romanized Japanese names VRoid and Booth models use.

***

### SLOT\_LABELS

```ts
const SLOT_LABELS: readonly ["eyewear", "headwear", "hairAccessory", "neck", "ear", "hand", "prop", "outerwear", "onepiece", "top", "bottom", "legwear", "footwear", "underwear", "hair", "face", "body"];
```

Every wardrobe slot a part can be sorted into, accessories first and the base body last.

***

### SPHERE\_MAP

```ts
const SPHERE_MAP: RegExp;
```

MMD sphere maps: a lighting lookup, never a surface color.

## Functions

### alternates()

```ts
function alternates(names): Set<string>;
```

Names that are alternates of another present name (`Shorts_down`,
`Shorts_on_leg`, `No_stocking_L` beside `Shorts` and `stocking_L`). They
start hidden so one garment state shows at a time.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `names` | readonly `string`[] |

#### Returns

`Set`\<`string`\>

***

### categorize()

```ts
function categorize(name): Category | null;
```

The best slot for a name, or null when no keyword scores.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |

#### Returns

[`Category`](#category) \| `null`

***

### checkRedistribution()

```ts
function checkRedistribution(meta, opts): RedistributionVerdict;
```

Whether an avatar may go into a shareable bundle. VRM 1.0 needs
`allowRedistribution`, and a modified or composed avatar needs
`allowModificationRedistribution`. VRM 0.x must not be
Redistribution_Prohibited, must not be ND when modified, and `Other`
asks the person to confirm. Run it for every donor of a composite.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `meta` | [`VrmMetaLike`](#vrmmetalike) \| `null` \| `undefined` |
| `opts` | \{ `modified`: `boolean`; \} |
| `opts.modified` | `boolean` |

#### Returns

[`RedistributionVerdict`](#redistributionverdict)

***

### cleanStem()

```ts
function cleanStem(p): string;
```

File name with copy suffixes and the image extension removed, lowercase.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `p` | `string` |

#### Returns

`string`

***

### gltfJson()

```ts
function gltfJson(bytes): Record<string, unknown> | null;
```

glTF JSON from a GLB or a .gltf text file, or null.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `bytes` | `Uint8Array` |

#### Returns

`Record`\<`string`, `unknown`\> \| `null`

***

### guessUnit()

```ts
function guessUnit(headOverFeet): number;
```

Unit guess from head over feet height in source units: the first of
meters, decimeters, centimeters, inches and millimeters that puts a head
joint (about 87 percent of stature, inferred) at 1.0 to 2.3 m stature.
Returns meters per source unit, or the scale to 1.6 m when none fits.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `headOverFeet` | `number` |

#### Returns

`number`

***

### hiddenInFile()

```ts
function hiddenInFile(bytes): Set<string>;
```

Model names the file marks invisible, from binary or ASCII FBX bytes.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `bytes` | `ArrayBuffer` \| `Uint8Array`\<`ArrayBufferLike`\> |

#### Returns

`Set`\<`string`\>

***

### load()

```ts
function load(source?): Promise<void>;
```

Loads the wasm. With no argument the inlined copy is used (works from file://).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `source?` | `WasmSource` |

#### Returns

`Promise`\<`void`\>

***

### loadSync()

```ts
function loadSync(source): void;
```

Loads the wasm synchronously from bytes or a compiled module.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `source` | `ArrayBuffer` \| `Module` \| `ArrayBufferView`\<`ArrayBufferLike`\> |

#### Returns

`void`

***

### partLabel()

```ts
function partLabel(raw): string;
```

Strips exporter decoration: VRoid prefixes, "(Instance)", copy suffixes.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `raw` | `string` |

#### Returns

`string`

***

### probeFbx()

```ts
function probeFbx(bytes): FbxProbe;
```

Tells a rigged character from an animation only file by reading the
first 256 KB: a character's Definitions section declares both Geometry
and Deformer object types, a clip declares neither.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `bytes` | `Uint8Array` |

#### Returns

[`FbxProbe`](#fbxprobe)

***

### sniffFormat()

```ts
function sniffFormat(bytes, name?): AvatarFormat;
```

Format from content; the file name breaks no ties, it only helps when the content says nothing.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `bytes` | `Uint8Array` | `undefined` |
| `name?` | `string` | `""` |

#### Returns

[`AvatarFormat`](#avatarformat)

***

### tokens()

```ts
function tokens(name): string[];
```

Lowercase word tokens: camelCase, snake, kebab, dots and digits split.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |

#### Returns

`string`[]
