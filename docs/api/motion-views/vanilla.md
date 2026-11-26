# vanilla

## Interfaces

### AvatarDropElement

The hb-avatar-drop element, with its view handle once connected.

#### Extends

- `HTMLElement`

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-handle"></a> `handle` | `readonly` | [`AvatarDropHandle`](#avatardrophandle) \| `null` |

***

### AvatarDropHandle

The handle `avatarDrop` returns: the last report, take files, open the picker, listen, dispose.

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-report"></a> `report` | `readonly` | [`AvatarReport`](#avatarreport) \| `null` |

#### Methods

##### dispose()

```ts
dispose(): void;
```

###### Returns

`void`

##### on()

```ts
on(fn): () => void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `fn` | (`e`) => `void` |

###### Returns

() => `void`

##### pick()

```ts
pick(): void;
```

Opens the file picker.

###### Returns

`void`

##### take()

```ts
take(files): Promise<AvatarReport | null>;
```

Reads files as a drop would. Resolves to the report, or null when the files held no body it could read.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `files` | readonly `DroppedFile`[] |

###### Returns

`Promise`\<[`AvatarReport`](#avatarreport) \| `null`\>

***

### AvatarDropOptions

Options of `avatarDrop`: the load options of a body plus the pick button and hint words.

#### Extends

- `BodyLoadOptions`

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-go"></a> `go?` | `boolean` | The pick button is the one pink action of the screen. Default false. | - |
| <a id="property-hint"></a> `hint?` | `string` | The line in the empty zone. | - |
| <a id="property-label"></a> `label?` | `string` | The pick button's words. | - |
| <a id="property-normalize"></a> `normalize?` | `NormalizeOptions` | - | `BodyLoadOptions.normalize` |
| <a id="property-repair"></a> `repair?` | `false` \| `RepairOptions` | - | `BodyLoadOptions.repair` |
| <a id="property-vrm"></a> `vrm?` | () => `Promise`\<`VrmHook`\> | The VRM hook, imported on the first .vrm: `() => import("@hackbuild/avatar/vrm").then((m) => m.vrmHook())`. Without it a VRM loads as plain glTF. | `BodyLoadOptions.vrm` |

***

### AvatarReport

What AvatarDrop learned about a dropped avatar: name, format, size, rig check, licence and still.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-bytes"></a> `bytes` | `number` | - |
| <a id="property-caps"></a> `caps` | `BodyCaps` | - |
| <a id="property-check"></a> `check` | [`RigCheck`](index.md#rigcheck) | - |
| <a id="property-files"></a> `files` | `number` | - |
| <a id="property-format"></a> `format` | `string` | - |
| <a id="property-licence"></a> `licence` | [`RigLine`](index.md#rigline) | - |
| <a id="property-name"></a> `name` | `string` | - |
| <a id="property-size"></a> `size` | `string` | - |
| <a id="property-thumb"></a> `thumb` | `Blob` \| `null` | The still, a PNG, or null when there is no webgl. |
| <a id="property-triangles"></a> `triangles` | `number` | - |

***

### CharacterStageElement

The hb-character-stage element, with its view handle once connected.

#### Extends

- `HTMLElement`

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-handle-1"></a> `handle` | `readonly` | [`CharacterStageHandle`](#characterstagehandle) \| `null` |

***

### CharacterStageHandle

The handle `characterStage` returns: show a body, speak, gesture, play clips, frame and listen.

#### Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="property-body"></a> `body` | `readonly` | `Body` \| `null` | - |
| <a id="property-doing"></a> `doing` | `readonly` | `string` | What the body is doing, as the corner plate says it. |
| <a id="property-framing"></a> `framing` | `readonly` | [`Framing`](#framing) | - |
| <a id="property-inset"></a> `inset` | `readonly` | `HTMLElement` | The inset slot, top left: put an eye view or a caption card in it. Hidden while empty. |
| <a id="property-speechsource"></a> `speechSource` | `readonly` | [`SpeechSource`](index.md#speechsource) \| `null` | Where the mouth timings of the last speech came from. |
| <a id="property-stage"></a> `stage` | `readonly` | `AvatarStage` | - |
| <a id="property-subject"></a> `subject` | `readonly` | `HTMLElement` | - |
| <a id="property-verbsel"></a> `verbsEl` | `readonly` | `HTMLElement` | - |

#### Methods

##### dispose()

```ts
dispose(): void;
```

###### Returns

`void`

##### frame()

```ts
frame(mode): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `mode` | [`Framing`](#framing) |

###### Returns

`void`

##### gesture()

```ts
gesture(id): boolean;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | [`Gesture`](#gesture-1) |

###### Returns

`boolean`

##### on()

```ts
on(fn): () => void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `fn` | (`e`) => `void` |

###### Returns

() => `void`

##### play()

```ts
play(clip, opts?): number;
```

Plays a clip on the body; the corner plate shows its name. Returns the ticket, -1 when it cannot play.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `clip` | `string` \| `Clip` \| `AnimationClip` |
| `opts?` | `PlayOptions` |

###### Returns

`number`

##### say()

```ts
say(speech, seconds?): Promise<void>;
```

Speaks. Audio plays and its level moves the mouth, with the words or
phonemes the engine timed; text alone moves the mouth on estimated word
timings with no sound. Resolves when the speech ends or a newer one starts.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `speech` | `string` \| [`Speech`](index.md#speech) |
| `seconds?` | `number` |

###### Returns

`Promise`\<`void`\>

##### setVerbs()

```ts
setVerbs(verbs): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `verbs` | readonly [`Verb`](#verb)[] |

###### Returns

`void`

##### show()

```ts
show(source): Promise<Body | null>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `source` | `string` \| `BodySource` \| readonly `DroppedFile`[] |

###### Returns

`Promise`\<`Body` \| `null`\>

##### showPlaceholder()

```ts
showPlaceholder(): void;
```

###### Returns

`void`

##### stop()

```ts
stop(): void;
```

###### Returns

`void`

##### turn()

```ts
turn(): void;
```

###### Returns

`void`

***

### CharacterStageOptions

Options of `characterStage`: stage options plus name, model URL, verbs, framing, drop and the hello speech.

#### Extends

- `StageOptions`

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-audiocontext"></a> `audioContext?` | `AudioContext` | The context real speech plays through; default one made on the first audio. | - |
| <a id="property-background"></a> `background?` | `number` \| `null` | Scene background; null leaves the canvas transparent. Default null. | `StageOptions.background` |
| <a id="property-body-1"></a> `body?` | `Omit`\<`BodyOptions`, `"rng"`\> | - | `StageOptions.body` |
| <a id="property-canvas"></a> `canvas?` | `HTMLCanvasElement` | A canvas to draw on; by default the stage makes one and appends it to the container. | `StageOptions.canvas` |
| <a id="property-drop"></a> `drop?` | `boolean` | Take files dropped on the stage. Default true. | - |
| <a id="property-environment"></a> `environment?` | `string` \| `EnvironmentRequest` | A scene to show from the start, as `setEnvironment` takes it. | `StageOptions.environment` |
| <a id="property-follow"></a> `follow?` | `FollowOptions` | - | `StageOptions.follow` |
| <a id="property-framing-1"></a> `framing?` | [`Framing`](#framing) | Bust frames from the knees to just over the head; full shows the whole body. Default bust. | - |
| <a id="property-hello"></a> `hello?` | \| `string` \| [`Speech`](index.md#speech) \| (() => [`Speech`](index.md#speech) \| `Promise`\<[`Speech`](index.md#speech)\>) | What say hello says: text, real speech, or a function that makes the speech when pressed. | - |
| <a id="property-lights"></a> `lights?` | `boolean` | The plain lights; false when the page brings its own. Default true. | `StageOptions.lights` |
| <a id="property-maxpixelratio"></a> `maxPixelRatio?` | `number` | Device pixels per CSS pixel, at most. Default 2 (proposed); a lit scene caps it at 1.5 (vendor). | `StageOptions.maxPixelRatio` |
| <a id="property-name-1"></a> `name?` | `string` | The name on the corner plate. Default the body's name. | - |
| <a id="property-normalize-1"></a> `normalize?` | `NormalizeOptions` | - | `StageOptions.normalize` |
| <a id="property-repair-1"></a> `repair?` | `false` \| `RepairOptions` | - | `StageOptions.repair` |
| <a id="property-restorebutton"></a> `restoreButton?` | `boolean` | A button with the restore line over a lost context. Default true. | `StageOptions.restoreButton` |
| <a id="property-rng"></a> `rng?` | `Rng` | Seeded randomness for gaze and blinks. Default seededRng("avatar-host"). | `StageOptions.rng` |
| <a id="property-src"></a> `src?` | `string` | A model URL to show; the placeholder body shows until it loads, and without one. | - |
| <a id="property-statsevery"></a> `statsEvery?` | `number` | Seconds between stats events. Default 1. | `StageOptions.statsEvery` |
| <a id="property-verbs"></a> `verbs?` | readonly [`Verb`](#verb)[] | - | - |
| <a id="property-vrm-1"></a> `vrm?` | () => `Promise`\<`VrmHook`\> | The VRM hook, imported on the first .vrm: `() => import("@hackbuild/avatar/vrm").then((m) => m.vrmHook())`. Without it a VRM loads as plain glTF. | `StageOptions.vrm` |

***

### ClipStripElement

The hb-clip-strip element, with its view handle and the items and picked clip as properties.

#### Extends

- `HTMLElement`

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-current"></a> `current` | `public` | `string` \| `null` |
| <a id="property-handle-2"></a> `handle` | `readonly` | [`ClipStripHandle`](#clipstriphandle) \| `null` |
| <a id="property-items"></a> `items` | `public` | readonly [`StripItem`](#stripitem)[] |

***

### ClipStripHandle

The handle `clipStrip` returns: set items, pick, set the play state, wait for stills, listen.

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-current-1"></a> `current` | `readonly` | [`StripItem`](#stripitem) \| `null` |
| <a id="property-playing"></a> `playing` | `readonly` | `boolean` |

#### Methods

##### dispose()

```ts
dispose(): void;
```

###### Returns

`void`

##### on()

```ts
on(fn): () => void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `fn` | (`e`) => `void` |

###### Returns

() => `void`

##### pick()

```ts
pick(id): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

###### Returns

`void`

##### setItems()

```ts
setItems(items, current?): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `items` | readonly [`StripItem`](#stripitem)[] |
| `current?` | `string` \| `null` |

###### Returns

`void`

##### setPlaying()

```ts
setPlaying(on): void;
```

The play state as the page knows it: true while the picked clip plays.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `on` | `boolean` |

###### Returns

`void`

##### thumbsIdle()

```ts
thumbsIdle(): Promise<void>;
```

Resolves when every still asked for so far is drawn or has failed.

###### Returns

`Promise`\<`void`\>

***

### ClipStripOptions

Options of `clipStrip`: the items, the picked clip, the play button and stills.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-current-2"></a> `current?` | `string` \| `null` | The picked clip; default the first. |
| <a id="property-go-1"></a> `go?` | `boolean` | The play button is the one pink action of the screen. Default true. |
| <a id="property-items-1"></a> `items?` | readonly [`StripItem`](#stripitem)[] | - |
| <a id="property-label-1"></a> `label?` | `string` | Accessible name of the strip. |
| <a id="property-thumbs"></a> `thumbs?` | `boolean` | Draw missing stills from `animation`. Default true. |

***

### MotionViewsOptions

Options `defineMotionViews` shares with every element it defines.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-drop-1"></a> `drop?` | [`AvatarDropOptions`](#avatardropoptions) | Options every hb-avatar-drop shares: the vrm hook. |
| <a id="property-stage-1"></a> `stage?` | [`CharacterStageOptions`](#characterstageoptions) | Options every hb-character-stage shares: the vrm hook, lights, follow. |

***

### StripItem

A clip in the strip; `animation` lets the strip draw its still.

#### Extends

- [`ClipItem`](index.md#clipitem)

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-animation"></a> `animation?` | () => `AnimationClip` \| `Promise`\<`AnimationClip`\> | - | - |
| <a id="property-from"></a> `from` | [`ClipFrom`](index.md#clipfrom) | - | [`ClipItem`](index.md#clipitem).[`from`](index.md#property-from) |
| <a id="property-id"></a> `id` | `string` | - | [`ClipItem`](index.md#clipitem).[`id`](index.md#property-id) |
| <a id="property-loop"></a> `loop` | `boolean` | - | [`ClipItem`](index.md#clipitem).[`loop`](index.md#property-loop) |
| <a id="property-name-2"></a> `name` | `string` | - | [`ClipItem`](index.md#clipitem).[`name`](index.md#property-name) |
| <a id="property-seconds"></a> `seconds` | `number` | Length in seconds. | [`ClipItem`](index.md#clipitem).[`seconds`](index.md#property-seconds) |
| <a id="property-tags"></a> `tags?` | `string`[] | Words for what the body does: walk, wave, nod. | [`ClipItem`](index.md#clipitem).[`tags`](index.md#property-tags) |
| <a id="property-thumb-1"></a> `thumb?` | `string` \| `Blob` | A thumbnail: an image URL or a PNG Blob. The strip draws one from `clip` when this is missing. | [`ClipItem`](index.md#clipitem).[`thumb`](index.md#property-thumb) |
| <a id="property-warn"></a> `warn?` | `string` | A problem a person should see before they pick it: "the loop jumps 14 degrees at the seam". | [`ClipItem`](index.md#clipitem).[`warn`](index.md#property-warn) |

***

### Verb

One verb on the stage. `go` makes it the one pink action; give it to one verb at most.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-go-2"></a> `go?` | `boolean` |
| <a id="property-id-1"></a> `id` | `string` |
| <a id="property-label-2"></a> `label` | `string` |

## Type Aliases

### AvatarDropEvent

```ts
type AvatarDropEvent = 
  | {
  files: readonly DroppedFile[];
  type: "picked";
}
  | {
  files: readonly DroppedFile[];
  report: AvatarReport;
  type: "checked";
}
  | {
  message: string;
  type: "failed";
}
  | {
  files: readonly DroppedFile[];
  report: AvatarReport;
  type: "use";
};
```

Events of AvatarDrop: files picked, the report checked, a failure, or the card pressed to use the avatar.

#### Union Members

##### Type Literal

```ts
{
  files: readonly DroppedFile[];
  type: "picked";
}
```

***

##### Type Literal

```ts
{
  files: readonly DroppedFile[];
  report: AvatarReport;
  type: "checked";
}
```

***

##### Type Literal

```ts
{
  message: string;
  type: "failed";
}
```

***

##### Type Literal

```ts
{
  files: readonly DroppedFile[];
  report: AvatarReport;
  type: "use";
}
```

The card was pressed: wear this avatar.

***

### CharacterStageEvent

```ts
type CharacterStageEvent = 
  | {
  caps: BodyCaps;
  name: string;
  placeholder: boolean;
  type: "loaded";
  warnings: string[];
}
  | {
  message: string;
  type: "failed";
}
  | {
  type: "doing";
  word: string;
}
  | {
  id: string;
  type: "verb";
}
  | {
  framing: Framing;
  type: "framing";
};
```

Events of CharacterStage: a body loaded or failed, what it is doing, a verb pressed, the framing changed.

***

### ClipStripEvent

```ts
type ClipStripEvent = 
  | {
  item: StripItem;
  type: "pick";
}
  | {
  item: StripItem;
  type: "play";
}
  | {
  item: StripItem;
  type: "stop";
}
  | {
  id: string;
  ok: boolean;
  type: "thumb";
};
```

Events of ClipStrip: a clip picked, play or stop pressed, a still drawn or failed.

***

### Framing

```ts
type Framing = "bust" | "full";
```

The stage shot: bust, or the full body.

***

### Gesture

```ts
type Gesture = "wave" | "nod" | "shake" | "bow";
```

A gesture written in code over the body's own bones.

## Variables

### DEFAULT\_VERBS

```ts
const DEFAULT_VERBS: readonly Verb[];
```

The verbs a stage shows by default: say hello is the next thing to do.

***

### GESTURES

```ts
const GESTURES: readonly Gesture[];
```

Every gesture `gestureClip` can make.

## Functions

### animationClipOf()

```ts
function animationClipOf(clip, names): AnimationClip;
```

A presence clip as a three.js AnimationClip with one quaternion track per bone object name.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `clip` | `Clip` |
| `names` | readonly `string`[] |

#### Returns

`AnimationClip`

***

### avatarDrop()

```ts
function avatarDrop(host, opts?): AvatarDropHandle;
```

Mounts the drop card into `host`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `host` | `HTMLElement` |
| `opts?` | [`AvatarDropOptions`](#avatardropoptions) |

#### Returns

[`AvatarDropHandle`](#avatardrophandle)

***

### characterStage()

```ts
function characterStage(host, opts?): CharacterStageHandle;
```

Mounts a character stage into `host`, which becomes the `.hb-lay-stage`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `host` | `HTMLElement` |
| `opts?` | [`CharacterStageOptions`](#characterstageoptions) |

#### Returns

[`CharacterStageHandle`](#characterstagehandle)

***

### clipStrip()

```ts
function clipStrip(host, opts?): ClipStripHandle;
```

Mounts a clip strip into `host`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `host` | `HTMLElement` |
| `opts?` | [`ClipStripOptions`](#clipstripoptions) |

#### Returns

[`ClipStripHandle`](#clipstriphandle)

***

### defineMotionViews()

```ts
function defineMotionViews(opts?): void;
```

Defines hb-character-stage, hb-avatar-drop and hb-clip-strip once.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts?` | [`MotionViewsOptions`](#motionviewsoptions) |

#### Returns

`void`

***

### gestureClip()

```ts
function gestureClip(
   id, 
   names, 
   base, 
   fps?
): Clip | null;
```

A gesture as a presence clip over `names`, starting from `base` (bones
times 4 local rotations, the pose when it was built). Bones the body
lacks are skipped; returns null when it has none of the gesture's bones.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `id` | [`Gesture`](#gesture-1) | `undefined` |
| `names` | readonly `string`[] | `undefined` |
| `base` | `ArrayLike`\<`number`\> | `undefined` |
| `fps?` | `number` | `30` |

#### Returns

`Clip` \| `null`

## References

### bytesWord

Re-exports [bytesWord](index.md#bytesword)

***

### ClipFrom

Re-exports [ClipFrom](index.md#clipfrom)

***

### clipFromFindings

Re-exports [clipFromFindings](index.md#clipfromfindings)

***

### ClipItem

Re-exports [ClipItem](index.md#clipitem)

***

### clipMeta

Re-exports [clipMeta](index.md#clipmeta)

***

### clipsFromBody

Re-exports [clipsFromBody](index.md#clipsfrombody)

***

### clipsFromPack

Re-exports [clipsFromPack](index.md#clipsfrompack)

***

### estimateSeconds

Re-exports [estimateSeconds](index.md#estimateseconds)

***

### FindingsLike

Re-exports [FindingsLike](index.md#findingslike)

***

### licenceLine

Re-exports [licenceLine](index.md#licenceline)

***

### LicenceMeta

Re-exports [LicenceMeta](index.md#licencemeta)

***

### nextClip

Re-exports [nextClip](index.md#nextclip)

***

### PackLike

Re-exports [PackLike](index.md#packlike)

***

### PackReportLike

Re-exports [PackReportLike](index.md#packreportlike)

***

### rigCheck

Re-exports [rigCheck](index.md#rigcheck-1)

***

### RigCheck

Re-exports [RigCheck](index.md#rigcheck)

***

### RigFacts

Re-exports [RigFacts](index.md#rigfacts)

***

### RigLine

Re-exports [RigLine](index.md#rigline)

***

### RigTone

Re-exports [RigTone](index.md#rigtone)

***

### secondsWord

Re-exports [secondsWord](index.md#secondsword)

***

### SizeFacts

Re-exports [SizeFacts](index.md#sizefacts)

***

### sizeLine

Re-exports [sizeLine](index.md#sizeline)

***

### Speech

Re-exports [Speech](index.md#speech)

***

### speechEvents

Re-exports [speechEvents](index.md#speechevents)

***

### SpeechSource

Re-exports [SpeechSource](index.md#speechsource)

***

### SpeechTiming

Re-exports [SpeechTiming](index.md#speechtiming)
