# three

## Interfaces

### EnvironmentOptions

Options of `loadEnvironment`: where the files come from and how kit models load.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-models"></a> `models?` | (`file`) => `Promise`\<`Object3D`\<`Object3DEventMap`\>\> | Loads kit models; default `modelLoader(resolve)`. |
| <a id="property-resolve"></a> `resolve?` | [`Resolve`](#resolve) | Gives the files a preset needs; the studio needs none. |

***

### LoadedEnvironment

A loaded scene, held off screen until `attach()`.

#### Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="property-id"></a> `id` | `readonly` | `string` | - |
| <a id="property-shadows"></a> `shadows` | `readonly` | `boolean` | The key light casts a shadow; the stage decides what casts one. |

#### Methods

##### attach()

```ts
attach(): void;
```

Puts it in the scene in one step; separate from loading so a stale load never touches what shows.

###### Returns

`void`

##### dispose()

```ts
dispose(): void;
```

Takes it out, clears only what is still its own, restores tone mapping and exposure, frees it.

###### Returns

`void`

## Type Aliases

### FileSource

```ts
type FileSource = string | URL | ArrayBuffer | Blob;
```

What the caller gives for a file path: a URL, or the bytes.

***

### Resolve

```ts
type Resolve = (file) => 
  | Promise<FileSource | null>
  | FileSource
  | null;
```

Finds a file a layout needs; rejects or returns null when it is not there.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `file` | `string` |

#### Returns

  \| `Promise`\<[`FileSource`](#filesource) \| `null`\>
  \| [`FileSource`](#filesource)
  \| `null`

## Variables

### SHADOW\_EXTENT

```ts
const SHADOW_EXTENT: 1.6 = 1.6;
```

Half width of the key light's shadow camera, meters (vendor).

***

### SHADOW\_MAP

```ts
const SHADOW_MAP: 1024 = 1024;
```

Key light shadow map side, pixels (vendor).

## Functions

### assemble()

```ts
function assemble(
   items, 
   scale, 
   load
): Promise<Group<Object3DEventMap>>;
```

Builds a set from kit models and flattens it: every mesh is baked into
world space and merged with the others of the same look, so a room of
fifty props draws in a couple of dozen calls. `load` gives each model
once; a model it cannot give rejects with `MissingFileError`. Source
geometries are disposed; materials and maps live on in the merged meshes.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `items` | readonly [`LayoutItem`](index.md#layoutitem)[] |
| `scale` | `number` |
| `load` | (`file`) => `Promise`\<`Object3D`\<`Object3DEventMap`\>\> |

#### Returns

`Promise`\<`Group`\<`Object3DEventMap`\>\>

***

### buildGround()

```ts
function buildGround(ground): Mesh;
```

The floor disk for open scenes; it takes the shadow.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ground` | \{ `color`: `string`; `radius`: `number`; \} |
| `ground.color` | `string` |
| `ground.radius` | `number` |

#### Returns

`Mesh`

***

### buildRig()

```ts
function buildRig(layout): Group;
```

The key light with a shadow over the character's spot, and a rim light from behind the other side.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `layout` | [`EnvironmentLayout`](index.md#environmentlayout) |

#### Returns

`Group`

***

### loadEnvironment()

```ts
function loadEnvironment(
   preset, 
   scene, 
   renderer, 
   opts?
): Promise<LoadedEnvironment>;
```

Loads a preset (or a preset id) fully without touching the scene. The
character's spot is the origin; nothing here moves the character or the
camera. A file the resolver cannot give rejects with `MissingFileError`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `preset` | `string` \| [`EnvironmentPreset`](index.md#environmentpreset) |
| `scene` | `Scene` |
| `renderer` | `WebGLRenderer` |
| `opts?` | [`EnvironmentOptions`](#environmentoptions) |

#### Returns

`Promise`\<[`LoadedEnvironment`](#loadedenvironment)\>

***

### loadHdri()

```ts
function loadHdri(resolve, file): Promise<DataTexture>;
```

An HDRI as a float equirect texture.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `resolve` | [`Resolve`](#resolve) |
| `file` | `string` |

#### Returns

`Promise`\<`DataTexture`\>

***

### modelLoader()

```ts
function modelLoader(resolve): (file) => Promise<Object3D<Object3DEventMap>>;
```

Kit models through GLTFLoader from what `resolve` gives.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `resolve` | [`Resolve`](#resolve) |

#### Returns

(`file`) => `Promise`\<`Object3D`\<`Object3DEventMap`\>\>

***

### probeFrom()

```ts
function probeFrom(
   renderer, 
   source, 
   intensity, 
   saturation
): Promise<{
  mean: number;
  probe: LightProbe;
}>;
```

Renders `source` into a 32 px cube and reads spherical harmonics from it,
normalized to an average radiance of 1 and pulled toward grey by
`saturation`; `mean` is the original average.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `renderer` | `WebGLRenderer` |
| `source` | `Scene` |
| `intensity` | `number` |
| `saturation` | `number` |

#### Returns

`Promise`\<\{
  `mean`: `number`;
  `probe`: `LightProbe`;
\}\>
