# index

## Classes

### MissingFileError

An Error for a file the resolver could not give; `file` carries the path.

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new MissingFileError(file): MissingFileError;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `file` | `string` |

###### Returns

[`MissingFileError`](#missingfileerror)

###### Overrides

`Error.constructor`

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-file"></a> `file` | `readonly` | `string` |

## Interfaces

### EnvironmentLayout

A scene as data: key and rim light, image light, backdrop, ground, fog and the set of kit models.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-backdrop"></a> `backdrop` | \| \{ `blur`: `number`; `intensity`: `number`; \} \| \{ `color`: `string`; \} | The HDRI as backdrop (blurred), or a flat color. |
| <a id="property-envintensity"></a> `envIntensity` | `number` | How much image light reaches standard materials, relative to the HDRI's average. |
| <a id="property-exposure"></a> `exposure` | `number` | Neutral tone mapping exposure. |
| <a id="property-fog"></a> `fog?` | `object` | - |
| `fog.color` | `string` | - |
| `fog.far` | `number` | - |
| `fog.near` | `number` | - |
| <a id="property-ground"></a> `ground?` | `object` | A disk under everything for open scenes; takes the character's shadow. |
| `ground.color` | `string` | - |
| `ground.radius` | `number` | - |
| <a id="property-items"></a> `items` | [`LayoutItem`](#layoutitem)[] | - |
| <a id="property-key"></a> `key` | `object` | - |
| `key.color` | `string` | - |
| `key.intensity` | `number` | - |
| <a id="property-keyazimuth"></a> `keyAzimuth` | `number` | Degrees around the character the key light comes from: 0 from the camera, positive toward the camera's right. An HDRI is turned so its brightest point sits behind the key light. |
| <a id="property-keyelevation"></a> `keyElevation` | `number` | - |
| <a id="property-probe"></a> `probe` | `object` | The light probe, the soft fill toon materials read, at an average radiance of `intensity`; `saturation` 0 to 1 pulls tinted rooms toward grey so skin stays skin. |
| `probe.intensity` | `number` | - |
| `probe.saturation` | `number` | - |
| <a id="property-rim"></a> `rim` | `object` | - |
| `rim.color` | `string` | - |
| `rim.intensity` | `number` | - |
| <a id="property-scale"></a> `scale` | `number` | Kit units to meters, for every item. |

***

### EnvironmentPreset

A named scene: its layout, the HDRI it lights from and the licence of its kit models.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-hdri"></a> `hdri` | [`HdriRef`](#hdriref) \| `null` | Null lights from the three.js room environment (MIT, in code). |
| <a id="property-id"></a> `id` | `string` | - |
| <a id="property-kitlicence"></a> `kitLicence` | `string` \| `null` | Licence of the kit models the layout uses, or null when it uses none. |
| <a id="property-label"></a> `label` | `string` | - |
| <a id="property-layout"></a> `layout` | [`EnvironmentLayout`](#environmentlayout) | - |

***

### HdriRef

An HDRI a preset needs, with its licence and source for the credit line.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-file-1"></a> `file` | `string` | Path as the caller's resolver knows it. |
| <a id="property-licence"></a> `licence` | `string` | Licence of the image, shown beside the control that fetches it. |
| <a id="property-source"></a> `source` | `string` | Where it comes from, for the credit line. |

***

### LayoutItem

One kit model placed in a layout, in kit units, optionally repeated on a grid.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-at"></a> `at` | \[`number`, `number`, `number`\] | Kit units. |
| <a id="property-grid"></a> `grid?` | \[`number`, `number`\] | Repeats the item on a grid, one kit unit apart along +X and +Z. |
| <a id="property-model"></a> `model` | `string` | Kit model path as the caller's resolver knows it, e.g. "kenney-furniture/wall.glb". |
| <a id="property-rot"></a> `rot?` | `number` | Degrees about +Y. |
| <a id="property-scale-1"></a> `scale?` | `number` | - |

## Variables

### cafe

```ts
const cafe: EnvironmentLayout;
```

A cafe corner from the Kenney Furniture kit under a cafe HDRI.

***

### outdoors

```ts
const outdoors: EnvironmentLayout;
```

An open scene of Kenney Nature kit models on a ground disk under a sky HDRI.

***

### PRESETS

```ts
const PRESETS: readonly EnvironmentPreset[];
```

One preset per layout, with the files each needs and their licences.

***

### room

```ts
const room: EnvironmentLayout;
```

A furnished room from the Kenney Furniture kit under an indoor HDRI.

***

### studio

```ts
const studio: EnvironmentLayout;
```

The studio: room environment light, a grey floor and a flat backdrop; needs no file.

## Functions

### azimuthOfU()

```ts
function azimuthOfU(u): number;
```

Azimuth, radians as atan2(x, z), of the direction three.js maps to equirect column `u` (0 to 1).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `u` | `number` |

#### Returns

`number`

***

### brightestAzimuth()

```ts
function brightestAzimuth(
   data, 
   width, 
   height, 
   channels?
): number;
```

Azimuth (radians, atan2(x, z)) of the brightest spot above the horizon of
an equirect image in linear RGB(A) floats. A five tap blur keeps a lone
hot pixel from winning over a whole window.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `data` | `ArrayLike`\<`number`\> | `undefined` |
| `width` | `number` | `undefined` |
| `height` | `number` | `undefined` |
| `channels?` | `number` | `4` |

#### Returns

`number`

***

### direction()

```ts
function direction(azimuthDeg, elevationDeg): [number, number, number];
```

Unit vector for degrees around the character (0 toward the camera, positive to its right) and above the floor.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `azimuthDeg` | `number` |
| `elevationDeg` | `number` |

#### Returns

\[`number`, `number`, `number`\]

***

### missingFor()

```ts
function missingFor(preset, have): string[];
```

The files of `needsOf` that `have` does not know; empty means the preset can load.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `preset` | `Pick`\<[`EnvironmentPreset`](#environmentpreset), `"layout"` \| `"hdri"`\> |
| `have` | (`file`) => `boolean` |

#### Returns

`string`[]

***

### needsOf()

```ts
function needsOf(preset): string[];
```

Every file a preset needs from the caller: the HDRI, then each kit model once.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `preset` | `Pick`\<[`EnvironmentPreset`](#environmentpreset), `"layout"` \| `"hdri"`\> |

#### Returns

`string`[]

***

### normalizeProbe()

```ts
function normalizeProbe(coefficients, saturation): number;
```

Scales nine spherical harmonic RGB coefficients in place to an average
radiance of 1 and pulls each toward its luminance by `saturation` (1
keeps the color). HDRIs differ in exposure by orders of magnitude; the
returned mean (the original average) lets the caller scale image light
the same way.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `coefficients` | \[`number`, `number`, `number`\][] |
| `saturation` | `number` |

#### Returns

`number`

***

### presetOf()

```ts
function presetOf(id): EnvironmentPreset | undefined;
```

A preset by id, or undefined.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

#### Returns

[`EnvironmentPreset`](#environmentpreset) \| `undefined`

***

### probeMean()

```ts
function probeMean(c0): number;
```

Average radiance of a probe from its first coefficient.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `c0` | \[`number`, `number`, `number`\] |

#### Returns

`number`
