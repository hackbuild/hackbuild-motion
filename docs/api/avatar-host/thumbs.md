# thumbs

## Classes

### AvatarPortrait

Avatar previews: each character loads, is drawn at rest with its own materials, and is freed.

#### Implements

- [`ThumbRenderer`](#thumbrenderer)\<[`AvatarThumbJob`](#avatarthumbjob)\>

#### Accessors

##### lost

###### Get Signature

```ts
get lost(): boolean;
```

True once the GPU context is gone; the queue builds a new renderer.

###### Returns

`boolean`

True once the GPU context is gone; the queue builds a new renderer.

###### Implementation of

[`ThumbRenderer`](#thumbrenderer).[`lost`](#property-lost)

#### Methods

##### dispose()

```ts
dispose(): void;
```

###### Returns

`void`

###### Implementation of

[`ThumbRenderer`](#thumbrenderer).[`dispose`](#dispose-2)

##### draw()

```ts
draw(job): Promise<Blob | null>;
```

The image, or null when the render gave none. Throws with a reason the queue reports.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `job` | [`AvatarThumbJob`](#avatarthumbjob) |

###### Returns

`Promise`\<`Blob` \| `null`\>

###### Implementation of

[`ThumbRenderer`](#thumbrenderer).[`draw`](#draw-2)

##### create()

```ts
static create(opts?): AvatarPortrait;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts?` | [`AvatarPortraitOptions`](#avatarportraitoptions) |

###### Returns

[`AvatarPortrait`](#avatarportrait)

***

### ClipPortrait

Clip previews on one clay figure.

#### Implements

- [`ThumbRenderer`](#thumbrenderer)\<[`ClipThumbJob`](#clipthumbjob)\>

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-figure"></a> `figure` | `readonly` | `Avatar` |

#### Accessors

##### lost

###### Get Signature

```ts
get lost(): boolean;
```

True once the GPU context is gone; the queue builds a new renderer.

###### Returns

`boolean`

True once the GPU context is gone; the queue builds a new renderer.

###### Implementation of

[`ThumbRenderer`](#thumbrenderer).[`lost`](#property-lost)

#### Methods

##### dispose()

```ts
dispose(): void;
```

###### Returns

`void`

###### Implementation of

[`ThumbRenderer`](#thumbrenderer).[`dispose`](#dispose-2)

##### draw()

```ts
draw(job): Promise<Blob | null>;
```

The image, or null when the render gave none. Throws with a reason the queue reports.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `job` | [`ClipThumbJob`](#clipthumbjob) |

###### Returns

`Promise`\<`Blob` \| `null`\>

###### Implementation of

[`ThumbRenderer`](#thumbrenderer).[`draw`](#draw-2)

##### create()

```ts
static create(opts?): Promise<ClipPortrait>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts?` | [`ClipPortraitOptions`](#clipportraitoptions) |

###### Returns

`Promise`\<[`ClipPortrait`](#clipportrait)\>

***

### ThumbQueue

Draws previews one at a time in the background, saves each image and remembers failures, paced so the page stays responsive.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-j"></a> `J` *extends* `object` |

#### Constructors

##### Constructor

```ts
new ThumbQueue<J>(opts): ThumbQueue<J>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts` | [`ThumbQueueOptions`](#thumbqueueoptions)\<`J`\> |

###### Returns

[`ThumbQueue`](#thumbqueue)\<`J`\>

#### Accessors

##### holding

###### Get Signature

```ts
get holding(): boolean;
```

True while a renderer is built or lingering.

###### Returns

`boolean`

##### progress

###### Get Signature

```ts
get progress(): ThumbProgress;
```

###### Returns

[`ThumbProgress`](#thumbprogress)

##### waiting

###### Get Signature

```ts
get waiting(): string[];
```

Ids waiting, next first.

###### Returns

`string`[]

#### Methods

##### destroy()

```ts
destroy(): void;
```

Stops, forgets what was seen and frees the renderer.

###### Returns

`void`

##### idle()

```ts
idle(): Promise<void>;
```

Resolves when the current run has drained.

###### Returns

`Promise`\<`void`\>

##### want()

```ts
want(jobs, urgent?): void;
```

Asks for previews. Items seen this session are skipped; `urgent` puts these first, waiting ones included.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `jobs` | readonly `J`[] | `undefined` |
| `urgent?` | `boolean` | `false` |

###### Returns

`void`

## Interfaces

### AvatarPortraitOptions

Image size, canvas and body load options of avatar previews.

#### Extends

- [`PortraitOptions`](#portraitoptions)
- [`BodyLoadOptions`](three.md#bodyloadoptions)

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-canvas"></a> `canvas?` | `HTMLCanvasElement` | A canvas to draw into; default a new one. | [`PortraitOptions`](#portraitoptions).[`canvas`](#property-canvas-2) |
| <a id="property-height"></a> `height?` | `number` | Image height in pixels. Default the width. | [`PortraitOptions`](#portraitoptions).[`height`](#property-height-2) |
| <a id="property-normalize"></a> `normalize?` | `NormalizeOptions` | - | [`BodyLoadOptions`](three.md#bodyloadoptions).[`normalize`](three.md#property-normalize) |
| <a id="property-repair"></a> `repair?` | `false` \| `RepairOptions` | - | [`BodyLoadOptions`](three.md#bodyloadoptions).[`repair`](three.md#property-repair) |
| <a id="property-vrm"></a> `vrm?` | () => `Promise`\<`VrmHook`\> | The VRM hook, imported on the first .vrm: `() => import("@hackbuild/avatar/vrm").then((m) => m.vrmHook())`. Without it a VRM loads as plain glTF. | [`BodyLoadOptions`](three.md#bodyloadoptions).[`vrm`](three.md#property-vrm) |
| <a id="property-width"></a> `width?` | `number` | Image width in pixels. Default 192. | [`PortraitOptions`](#portraitoptions).[`width`](#property-width-2) |

***

### AvatarThumbJob

One avatar to preview. The queue calls `release` on the source once its load settles.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-id"></a> `id` | `string` |
| <a id="property-source"></a> `source` | [`BodySource`](index.md#bodysource) |

***

### ClipPortraitOptions

Image size, clay colour and figure of clip previews.

#### Extends

- [`PortraitOptions`](#portraitoptions)

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-canvas-1"></a> `canvas?` | `HTMLCanvasElement` | A canvas to draw into; default a new one. | [`PortraitOptions`](#portraitoptions).[`canvas`](#property-canvas-2) |
| <a id="property-color"></a> `color?` | `string` \| `number` | Clay colour. Default a warm grey. | - |
| <a id="property-figure-1"></a> `figure?` | () => `Avatar` \| `Promise`\<`Avatar`\> | The figure; default the built in placeholder body. Its materials are replaced by the clay. | - |
| <a id="property-height-1"></a> `height?` | `number` | Image height in pixels. Default the width. | [`PortraitOptions`](#portraitoptions).[`height`](#property-height-2) |
| <a id="property-width-1"></a> `width?` | `number` | Image width in pixels. Default 192. | [`PortraitOptions`](#portraitoptions).[`width`](#property-width-2) |

***

### ClipThumbJob

One clip to preview: its id, the clip in normalized bone names, and whether it is a held pose.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-hold"></a> `hold?` | `boolean` | A pose: show its last frame. |
| <a id="property-id-1"></a> `id` | `string` | - |

#### Methods

##### clip()

```ts
clip(): AnimationClip | Promise<AnimationClip>;
```

###### Returns

`AnimationClip` \| `Promise`\<`AnimationClip`\>

***

### PortraitOptions

Image width, height and canvas of a preview.

#### Extended by

- [`ClipPortraitOptions`](#clipportraitoptions)
- [`AvatarPortraitOptions`](#avatarportraitoptions)

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-canvas-2"></a> `canvas?` | `HTMLCanvasElement` | A canvas to draw into; default a new one. |
| <a id="property-height-2"></a> `height?` | `number` | Image height in pixels. Default the width. |
| <a id="property-width-2"></a> `width?` | `number` | Image width in pixels. Default 192. |

***

### ThumbProgress

Counts for a progress line: items done of items asked for in this run.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-active"></a> `active` | `boolean` |
| <a id="property-done"></a> `done` | `number` |
| <a id="property-total"></a> `total` | `number` |

***

### ThumbQueueOptions

The renderer factory, the save call, the failure and progress calls of a `ThumbQueue`.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-j-1"></a> `J` |

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-lingerms"></a> `lingerMs?` | `number` | How long the renderer is kept once the queue is empty, ms. Default 20000 (vendor). |
| <a id="property-maxrestms"></a> `maxRestMs?` | `number` | Rest between items, ms: at most this. Default 400 (vendor). |
| <a id="property-minrestms"></a> `minRestMs?` | `number` | Rest between items, ms: at least this. Default 40 (vendor). |

#### Methods

##### failed()?

```ts
failed?(id, reason): void;
```

An item that gave no image, and why. It is not tried again this session.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |
| `reason` | `string` |

###### Returns

`void`

##### hidden()?

```ts
hidden?(): boolean;
```

True while the page is hidden; default reads `document.visibilityState`.

###### Returns

`boolean`

##### now()?

```ts
now?(): number;
```

Clock in ms; default `performance.now`.

###### Returns

`number`

##### onProgress()?

```ts
onProgress?(p): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `p` | [`ThumbProgress`](#thumbprogress) |

###### Returns

`void`

##### renderer()

```ts
renderer(): Promise<ThumbRenderer<J> | null>;
```

Builds the renderer, on first need and after a lost context. Null or a throw ends the run.

###### Returns

`Promise`\<[`ThumbRenderer`](#thumbrenderer)\<`J`\> \| `null`\>

##### save()

```ts
save(id, image): Promise<void>;
```

Keeps a drawn image, for instance in a blob store by content hash.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |
| `image` | `Blob` |

###### Returns

`Promise`\<`void`\>

***

### ThumbRenderer

Draws one item to an image.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-j-2"></a> `J` |

#### Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="property-lost"></a> `lost` | `readonly` | `boolean` | True once the GPU context is gone; the queue builds a new renderer. |

#### Methods

##### dispose()

```ts
dispose(): void;
```

###### Returns

`void`

##### draw()

```ts
draw(job): Promise<Blob | null>;
```

The image, or null when the render gave none. Throws with a reason the queue reports.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `job` | `J` |

###### Returns

`Promise`\<`Blob` \| `null`\>

## Type Aliases

### AvatarThumbOptions

```ts
type AvatarThumbOptions = Omit<ThumbQueueOptions<AvatarThumbJob>, "renderer"> & object;
```

Queue and portrait options of `avatarThumbs`.

#### Type Declaration

| Name | Type |
| ------ | ------ |
| `portrait?` | [`AvatarPortraitOptions`](#avatarportraitoptions) |

***

### ClipThumbOptions

```ts
type ClipThumbOptions = Omit<ThumbQueueOptions<ClipThumbJob>, "renderer"> & object;
```

Queue and portrait options of `clipThumbs`.

#### Type Declaration

| Name | Type |
| ------ | ------ |
| `portrait?` | [`ClipPortraitOptions`](#clipportraitoptions) |

## Variables

### MEASURED

```ts
const MEASURED: readonly HumanBone[];
```

Bones that judge a frame; fingers would outvote them by count.

***

### SAMPLES

```ts
const SAMPLES: 24 = 24;
```

Frames tried when looking for the most telling one.

## Functions

### avatarThumbs()

```ts
function avatarThumbs(opts): ThumbQueue<AvatarThumbJob>;
```

A queue of avatar previews, 240 by 320 px by default.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts` | [`AvatarThumbOptions`](#avatarthumboptions) |

#### Returns

[`ThumbQueue`](#thumbqueue)\<[`AvatarThumbJob`](#avatarthumbjob)\>

***

### clipThumbs()

```ts
function clipThumbs(opts): ThumbQueue<ClipThumbJob>;
```

A queue of clip previews on one clay figure, 192 px square by default.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts` | [`ClipThumbOptions`](#clipthumboptions) |

#### Returns

[`ThumbQueue`](#thumbqueue)\<[`ClipThumbJob`](#clipthumbjob)\>

***

### frameBox()

```ts
function frameBox(
   cam, 
   box, 
   aspect?
): void;
```

Points an orthographic camera at `box` from the portrait angle and fits it, `aspect` width over height.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `cam` | `OrthographicCamera` | `undefined` |
| `box` | `Box3` | `undefined` |
| `aspect?` | `number` | `1` |

#### Returns

`void`

***

### tellingTime()

```ts
function tellingTime(
   figure, 
   clip, 
   hold?, 
   samples?
): number;
```

The time of the clip's most telling frame on `figure`: for a held pose
or a clip under 0.05 s its end, else the sampled frame between 10 and 90
percent whose measured bones turn furthest from their rest rotation
(the ends are where most clips stand near rest). Leaves the figure posed
at that time; the caller resets it.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `figure` | `Avatar` | `undefined` |
| `clip` | `AnimationClip` | `undefined` |
| `hold?` | `boolean` | `false` |
| `samples?` | `number` | `SAMPLES` |

#### Returns

`number`
