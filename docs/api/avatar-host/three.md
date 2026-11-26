# three

## Classes

### AvatarStage

A three.js stage in a container: renderer, camera, orbit controls, follow camera, loop, environment slot and the body it shows.

#### Constructors

##### Constructor

```ts
new AvatarStage(container, opts?): AvatarStage;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `container` | `HTMLElement` |
| `opts?` | [`StageOptions`](#stageoptions) |

###### Returns

[`AvatarStage`](#avatarstage)

#### Properties

| Property | Modifier | Type | Default value | Description |
| ------ | ------ | ------ | ------ | ------ |
| <a id="property-body"></a> `body` | `public` | [`Body`](#body) \| `null` | `null` | The body on stage, or null. |
| <a id="property-camera"></a> `camera` | `readonly` | `PerspectiveCamera` | `...` | - |
| <a id="property-canvas"></a> `canvas` | `readonly` | `HTMLCanvasElement` | `undefined` | - |
| <a id="property-container"></a> `container` | `readonly` | `HTMLElement` | `undefined` | - |
| <a id="property-controls"></a> `controls` | `readonly` | `OrbitControls` | `undefined` | - |
| <a id="property-environment"></a> `environment` | `readonly` | [`EnvironmentSlot`](#environmentslot) | `undefined` | The lit scene around the body: `stage.environment.set("studio")`. |
| <a id="property-follow"></a> `follow` | `readonly` | [`FollowCamera`](#followcamera) | `undefined` | - |
| <a id="property-lights"></a> `lights` | `readonly` | `Light`[] | `[]` | - |
| <a id="property-loop"></a> `loop` | `readonly` | [`StageLoop`](index.md#stageloop) | `undefined` | - |
| <a id="property-pointer"></a> `pointer` | `readonly` | `Vector2` | `...` | Normalized pointer over the canvas, -1 to 1, for gaze. |
| <a id="property-renderer"></a> `renderer` | `readonly` | `WebGLRenderer` | `undefined` | - |
| <a id="property-scene"></a> `scene` | `readonly` | `Scene`\<`Object3DEventMap`\> | `...` | - |

#### Methods

##### dispose()

```ts
dispose(): void;
```

Stops the loop, frees the body, the renderer and its context, and removes what the stage added.

###### Returns

`void`

##### lookAtView()

```ts
lookAtView(p): void;
```

Gaze at a point in view coordinates (-1 to 1, +y up), or null to hand gaze back to the pointer and camera.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `p` | \| \{ `x`: `number`; `y`: `number`; \} \| `null` |

###### Returns

`void`

##### on()

```ts
on<K>(type, fn): () => void;
```

Subscribes to one event type; returns the unsubscribe.

###### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-k"></a> `K` *extends* `"failed"` \| `"lost"` \| `"loaded"` \| `"stats"` \| `"state"` \| `"restored"` |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `type` | `K` |
| `fn` | (`e`) => `void` |

###### Returns

() => `void`

##### pause()

```ts
pause(): void;
```

Stops the loop by hand; other reasons still apply after play().

###### Returns

`void`

##### play()

```ts
play(): void;
```

Starts the loop after a pause by hand.

###### Returns

`void`

##### resetView()

```ts
resetView(): void;
```

Frames the body again and forgets the person's pan and zoom.

###### Returns

`void`

##### resize()

```ts
resize(): void;
```

###### Returns

`void`

##### restore()

```ts
restore(): void;
```

After a lost context: asks the browser for the context back. A loss the browser caused comes back by itself when it can.

###### Returns

`void`

##### setActive()

```ts
setActive(on): void;
```

The tool's route is (in)active.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `on` | `boolean` |

###### Returns

`void`

##### setCovered()

```ts
setCovered(on): void;
```

A sheet or a modal covers the stage fully.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `on` | `boolean` |

###### Returns

`void`

##### setEnvironment()

```ts
setEnvironment(env): void;
```

The swap the environment slot calls: old scene out first, new one in, shadows and lights to match.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `env` | `LoadedEnvironment` \| `null` |

###### Returns

`void`

##### setFollow()

```ts
setFollow(on): void;
```

Turns the follow camera on or off. Off, the camera stays put until the person moves it or `resetView` frames the body.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `on` | `boolean` |

###### Returns

`void`

##### show()

```ts
show(source): Promise<Body | null>;
```

Shows a body from a source, a URL, or dropped files. Resolves to the
body, or null when a later show superseded it or it failed; a failure
emits `failed` with copy for the person and keeps the current body.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `source` | \| `string` \| [`BodySource`](index.md#bodysource) \| readonly [`DroppedFile`](index.md#droppedfile)[] \| `Promise`\<[`BodySource`](index.md#bodysource)\> |

###### Returns

`Promise`\<[`Body`](#body) \| `null`\>

##### showAvatar()

```ts
showAvatar(avatar, name?): Body;
```

Shows an Avatar loaded elsewhere; the stage owns it from here and disposes it on the next swap.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `avatar` | `Avatar` |
| `name?` | `string` |

###### Returns

[`Body`](#body)

##### showEnvironment()

```ts
showEnvironment(req): Promise<boolean>;
```

Shows a lit scene by preset id or request, or the plain stage for null.
Resolves true when that scene shows; a missing file emits `failed` with the
environment copy and keeps the current scene.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `req` | `string` \| [`EnvironmentRequest`](#environmentrequest) \| `null` |

###### Returns

`Promise`\<`boolean`\>

##### showPlaceholder()

```ts
showPlaceholder(opts?): Body;
```

Shows the placeholder body and supersedes any load in flight.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts?` | [`PlaceholderOptions`](#placeholderoptions) |

###### Returns

[`Body`](#body)

##### snapshot()

```ts
snapshot(type?): Promise<Blob | null>;
```

One frame rendered now and read in the same task, as a PNG.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `type?` | `string` | `"image/png"` |

###### Returns

`Promise`\<`Blob` \| `null`\>

##### zoomBy()

```ts
zoomBy(factor): void;
```

factor above 1 moves closer.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `factor` | `number` |

###### Returns

`void`

***

### Body

A loaded character driven in the presence frame order: clip player, gaze, lip sync and face, written to its bones each frame.

#### Constructors

##### Constructor

```ts
new Body(avatar, opts): Body;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `avatar` | `Avatar` |
| `opts` | [`BodyOptions`](#bodyoptions) |

###### Returns

[`Body`](#body)

#### Properties

| Property | Modifier | Type | Default value | Description |
| ------ | ------ | ------ | ------ | ------ |
| <a id="property-avatar"></a> `avatar` | `readonly` | `Avatar` | `undefined` | - |
| <a id="property-bones"></a> `bones` | `readonly` | `Object3D`\<`Object3DEventMap`\>[] | `[]` | - |
| <a id="property-caps"></a> `caps` | `readonly` | [`BodyCaps`](#bodycaps) | `undefined` | - |
| <a id="property-face"></a> `face` | `readonly` | `Face` | `undefined` | The face driver every expression weight goes through. |
| <a id="property-gaze"></a> `gaze` | `readonly` | `GazeController` \| `null` | `undefined` | - |
| <a id="property-gazeon"></a> `gazeOn` | `public` | `boolean` | `undefined` | Turn gaze off and on without a new body. |
| <a id="property-lip"></a> `lip` | `readonly` | `LipSync` | `...` | - |
| <a id="property-mouth"></a> `mouth` | `readonly` | `MouthTarget` | `undefined` | - |
| <a id="property-names"></a> `names` | `readonly` | ( \| `"hips"` \| `"spine"` \| `"chest"` \| `"upperChest"` \| `"neck"` \| `"head"` \| `"leftEye"` \| `"rightEye"` \| `"jaw"` \| `"leftUpperLeg"` \| `"leftLowerLeg"` \| `"leftFoot"` \| `"leftToes"` \| `"rightUpperLeg"` \| `"rightLowerLeg"` \| `"rightFoot"` \| `"rightToes"` \| `"leftShoulder"` \| `"leftUpperArm"` \| `"leftLowerArm"` \| `"leftHand"` \| `"rightShoulder"` \| `"rightUpperArm"` \| `"rightLowerArm"` \| `"rightHand"` \| `"leftThumbMetacarpal"` \| `"leftThumbProximal"` \| `"leftThumbDistal"` \| `"leftIndexProximal"` \| `"leftIndexIntermediate"` \| `"leftIndexDistal"` \| `"leftMiddleProximal"` \| `"leftMiddleIntermediate"` \| `"leftMiddleDistal"` \| `"leftRingProximal"` \| `"leftRingIntermediate"` \| `"leftRingDistal"` \| `"leftLittleProximal"` \| `"leftLittleIntermediate"` \| `"leftLittleDistal"` \| `"rightThumbMetacarpal"` \| `"rightThumbProximal"` \| `"rightThumbDistal"` \| `"rightIndexProximal"` \| `"rightIndexIntermediate"` \| `"rightIndexDistal"` \| `"rightMiddleProximal"` \| `"rightMiddleIntermediate"` \| `"rightMiddleDistal"` \| `"rightRingProximal"` \| `"rightRingIntermediate"` \| `"rightRingDistal"` \| `"rightLittleProximal"` \| `"rightLittleIntermediate"` \| `"rightLittleDistal"`)[] | `[]` | - |
| <a id="property-player"></a> `player` | `readonly` | `ClipPlayer` | `undefined` | - |

#### Accessors

##### name

###### Get Signature

```ts
get name(): string;
```

###### Returns

`string`

##### wardrobe

###### Get Signature

```ts
get wardrobe(): Part[];
```

###### Returns

`Part`[]

#### Methods

##### clipOf()

```ts
clipOf(anim, loop?): Clip | null;
```

A presence clip over this body's bone order, from one of its animations (by name or object).

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `anim` | `string` \| `AnimationClip` |
| `loop?` | `boolean` |

###### Returns

`Clip` \| `null`

##### dispose()

```ts
dispose(): void;
```

###### Returns

`void`

##### expressionNames()

```ts
expressionNames(): string[];
```

Expression names the face carries: VRM presets and custom names, or presets the morph rig resolved.

###### Returns

`string`[]

##### eyePosition()

```ts
eyePosition(out): Vector3;
```

Where the eyes sit, world space.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `out` | `Vector3` |

###### Returns

`Vector3`

##### moving()

```ts
moving(): boolean;
```

True while a clip or a mouth moves the body by itself (reduced motion keeps drawing then).

###### Returns

`boolean`

##### play()

```ts
play(clip, opts?): number;
```

Plays a clip; returns its ticket, or -1 when the name is not one of the body's clips.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `clip` | `string` \| `AnimationClip` \| `Clip` |
| `opts?` | `PlayOptions` |

###### Returns

`number`

##### setExpression()

```ts
setExpression(name, weight?): void;
```

Holds one mood, eased in by the face driver; null hands the face back to its resting weights.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `name` | `string` \| `null` | `undefined` |
| `weight?` | `number` | `1` |

###### Returns

`void`

##### setGazeMode()

```ts
setGazeMode(mode): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `mode` | `GazeMode` |

###### Returns

`void`

##### setPartVisible()

```ts
setPartVisible(id, on): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |
| `on` | `boolean` |

###### Returns

`void`

##### stop()

```ts
stop(layer?, fade?): void;
```

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `layer?` | `Layer` | `"body"` |
| `fade?` | `number` | `undefined` |

###### Returns

`void`

##### update()

```ts
update(
   dt, 
   look, 
   still, 
   mouthTime
): void;
```

One frame. `look` is the gaze target in world space, null to keep the
last; `still` stops idle motion (gaze, blink) for reduced motion;
`mouthTime` is the clock the speech events were timed on.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `dt` | `number` |
| `look` | `Vector3` \| `null` |
| `still` | `boolean` |
| `mouthTime` | `number` |

###### Returns

`void`

***

### EnvironmentSlot

Shows one lit scene at a time on a stage; a later request overtakes one still loading.

#### Constructors

##### Constructor

```ts
new EnvironmentSlot(target, load?): EnvironmentSlot;
```

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `target` | [`EnvironmentTarget`](#environmenttarget) | `undefined` |
| `load?` | [`EnvironmentLoader`](#environmentloader) | `defaultLoad` |

###### Returns

[`EnvironmentSlot`](#environmentslot)

#### Accessors

##### current

###### Get Signature

```ts
get current(): string | null;
```

Id of the scene showing now, or null for the plain stage.

###### Returns

`string` \| `null`

#### Methods

##### cancel()

```ts
cancel(): void;
```

Overtakes any load in flight.

###### Returns

`void`

##### set()

```ts
set(req): Promise<LoadedEnvironment | null>;
```

Shows a scene, or the plain stage for null. Resolves to the scene, or
null when it was cleared or a later call overtook it; the same id
again does nothing. A load failure rejects and keeps the current scene.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `req` | `string` \| [`EnvironmentRequest`](#environmentrequest) \| `null` |

###### Returns

`Promise`\<`LoadedEnvironment` \| `null`\>

***

### FollowCamera

Keeps a body framed: eases toward a new framing with a dead zone, and leaves a distance or pan the person picked alone.

#### Constructors

##### Constructor

```ts
new FollowCamera(
   camera, 
   target, 
   opts?
): FollowCamera;
```

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `camera` | `PerspectiveCamera` | - |
| `target` | `Vector3` | The orbit target the camera looks at (OrbitControls.target). |
| `opts?` | [`FollowOptions`](#followoptions) | - |

###### Returns

[`FollowCamera`](#followcamera)

#### Properties

| Property | Modifier | Type | Default value | Description |
| ------ | ------ | ------ | ------ | ------ |
| <a id="property-camera-1"></a> `camera` | `readonly` | `PerspectiveCamera` | `undefined` | - |
| <a id="property-deadzone"></a> `deadZone` | `readonly` | `number` | `undefined` | - |
| <a id="property-follow-1"></a> `follow` | `public` | `boolean` | `undefined` | False: step moves nothing; frame, zoomBy and released still work. |
| <a id="property-margin"></a> `margin` | `readonly` | `number` | `undefined` | - |
| <a id="property-offset"></a> `offset` | `readonly` | `Vector3` | `...` | Where the person panned to, from the body's centre. |
| <a id="property-rate"></a> `rate` | `readonly` | `number` | `undefined` | - |
| <a id="property-slack"></a> `slack` | `readonly` | `number` | `undefined` | - |
| <a id="property-target"></a> `target` | `readonly` | `Vector3` | `undefined` | The orbit target the camera looks at (OrbitControls.target). |
| <a id="property-zoomed"></a> `zoomed` | `public` | `boolean` | `false` | Set when the person picked a distance; fitting then leaves it alone. |

#### Methods

##### distance()

```ts
distance(): number;
```

###### Returns

`number`

##### fitDistance()

```ts
fitDistance(box): number;
```

Distance at which the box fills the view with the margin, from any side.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `box` | `Box3` |

###### Returns

`number`

##### frame()

```ts
frame(box): void;
```

Frames the box from the front (+Z) and forgets the person's pan and zoom.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `box` | `Box3` |

###### Returns

`void`

##### released()

```ts
released(box, startDistance): void;
```

After the person let go: keep their pan as an offset, and their distance when it changed.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `box` | `Box3` \| `null` |
| `startDistance` | `number` |

###### Returns

`void`

##### step()

```ts
step(box, dt): boolean;
```

One frame of following. Returns true when the camera moved.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `box` | `Box3` |
| `dt` | `number` |

###### Returns

`boolean`

##### zoomBy()

```ts
zoomBy(
   factor, 
   min?, 
   max?
): void;
```

factor above 1 moves closer; the distance is then the person's.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `factor` | `number` | `undefined` |
| `min?` | `number` | `0.2` |
| `max?` | `number` | `50` |

###### Returns

`void`

## Interfaces

### AvatarHostElement

The `hb-avatar-host` custom element: a stage in the element, and a call to show dropped files.

#### Extends

- `HTMLElement`

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-stage"></a> `stage` | `readonly` | [`AvatarStage`](#avatarstage) \| `null` |

#### Methods

##### showFiles()

```ts
showFiles(files): Promise<void>;
```

Shows dropped or picked files; resolves when the load settles.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `files` | readonly [`DroppedFile`](index.md#droppedfile)[] |

###### Returns

`Promise`\<`void`\>

***

### BodyCaps

What a loaded body can do, for the capability note under the stage.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-blink"></a> `blink` | `boolean` |
| <a id="property-bones-1"></a> `bones` | `number` |
| <a id="property-clips"></a> `clips` | `string`[] |
| <a id="property-expressions"></a> `expressions` | `string`[] |
| <a id="property-gaze-1"></a> `gaze` | `boolean` |
| <a id="property-mouth-1"></a> `mouth` | `boolean` |
| <a id="property-parts"></a> `parts` | `number` |

***

### BodyLoadOptions

The VRM hook, normalize and repair options used when a body loads.

#### Extended by

- [`StageOptions`](#stageoptions)
- [`AvatarPortraitOptions`](thumbs.md#avatarportraitoptions)

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-normalize"></a> `normalize?` | `NormalizeOptions` | - |
| <a id="property-repair"></a> `repair?` | `false` \| `RepairOptions` | - |
| <a id="property-vrm"></a> `vrm?` | () => `Promise`\<`VrmHook`\> | The VRM hook, imported on the first .vrm: `() => import("@hackbuild/avatar/vrm").then((m) => m.vrmHook())`. Without it a VRM loads as plain glTF. |

***

### BodyOptions

Random source, gaze, head levelling, mouth target and clip options of a `Body`.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-gaze-2"></a> `gaze?` | `boolean` \| `"auto"` | Gaze on neck, head and eyes. auto turns it on when the head's rest frame is upright and facing +Z. Default auto. |
| <a id="property-levelhead"></a> `levelHead?` | `boolean` | Lift a head that clips hold low. Default on when gaze is on. |
| <a id="property-mouth-2"></a> `mouth?` | `MouthTarget` | Which face channels the mouth writes. Default picked from the face's names. |
| <a id="property-restingface"></a> `restingFace?` | `false` \| `Readonly`\<`Record`\<`string`, `number`\>\> | Weights a quiet face rests at; false for a neutral face. Default RESTING_FACE (a slight smile). |
| <a id="property-rng"></a> `rng` | `Rng` | - |
| <a id="property-stance"></a> `stance?` | `"relaxed"` \| `"rest"` | Base layer: "relaxed" lowers the arms to the sides, "rest" keeps the loaded rest pose. Default relaxed. |

***

### EnvironmentRequest

A scene preset by id or value, and how its files resolve.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-preset"></a> `preset` | `string` \| `EnvironmentPreset` | A preset id (studio, room, cafe, outdoors) or a preset. |
| <a id="property-resolve"></a> `resolve?` | `Resolve` | Gives the files the preset needs; the studio needs none. |

***

### EnvironmentTarget

What an environment slot writes to: the scene, the renderer and the call that swaps the shown scene.

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-renderer-1"></a> `renderer` | `readonly` | `WebGLRenderer` |
| <a id="property-scene-1"></a> `scene` | `readonly` | `Scene` |

#### Methods

##### setEnvironment()

```ts
setEnvironment(env): void;
```

Swaps the shown scene: disposes the old one, attaches the new one or none.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `env` | `LoadedEnvironment` \| `null` |

###### Returns

`void`

***

### FollowOptions

Follow switch, ease rate, dead zone and margin of a `FollowCamera`.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-deadzone-1"></a> `deadZone?` | `number` | Body movement under this share of its height moves nothing. Default 0.06 (vendor). |
| <a id="property-follow-2"></a> `follow?` | `boolean` | Follow the body; false leaves the camera where the person or the last framing put it. Default true. |
| <a id="property-margin-1"></a> `margin?` | `number` | Fit margin over the tight fit. Default 1.12 (vendor). |
| <a id="property-rate-1"></a> `rate?` | `number` | Ease rate per second toward a new framing. Default 3 (vendor). |
| <a id="property-slack-1"></a> `slack?` | `number` | Comes closer only when this share too far. Default 0.12 (vendor). |

***

### PlaceholderOptions

Body colour, joint colour and height scale of the placeholder body built in code.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-color"></a> `color?` | `number` | Body colour. Default a warm grey. |
| <a id="property-jointcolor"></a> `jointColor?` | `number` | Joint colour. |
| <a id="property-scale"></a> `scale?` | `number` | Overall height scale; 1 puts the head top near 1.74 m (computed from the joint table). |

***

### StageOptions

Canvas, random source, pixel ratio, background, environment and body load options of an `AvatarStage`.

#### Extends

- [`BodyLoadOptions`](#bodyloadoptions)

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-background"></a> `background?` | `number` \| `null` | Scene background; null leaves the canvas transparent. Default null. | - |
| <a id="property-body-1"></a> `body?` | `Omit`\<[`BodyOptions`](#bodyoptions), `"rng"`\> | - | - |
| <a id="property-canvas-1"></a> `canvas?` | `HTMLCanvasElement` | A canvas to draw on; by default the stage makes one and appends it to the container. | - |
| <a id="property-environment-1"></a> `environment?` | `string` \| [`EnvironmentRequest`](#environmentrequest) | A scene to show from the start, as `setEnvironment` takes it. | - |
| <a id="property-follow-3"></a> `follow?` | [`FollowOptions`](#followoptions) | - | - |
| <a id="property-lights-1"></a> `lights?` | `boolean` | The plain lights; false when the page brings its own. Default true. | - |
| <a id="property-maxpixelratio"></a> `maxPixelRatio?` | `number` | Device pixels per CSS pixel, at most. Default 2 (proposed); a lit scene caps it at 1.5 (vendor). | - |
| <a id="property-normalize-1"></a> `normalize?` | `NormalizeOptions` | - | [`BodyLoadOptions`](#bodyloadoptions).[`normalize`](#property-normalize) |
| <a id="property-repair-1"></a> `repair?` | `false` \| `RepairOptions` | - | [`BodyLoadOptions`](#bodyloadoptions).[`repair`](#property-repair) |
| <a id="property-restorebutton"></a> `restoreButton?` | `boolean` | A button with the restore line over a lost context. Default true. | - |
| <a id="property-rng-1"></a> `rng?` | `Rng` | Seeded randomness for gaze and blinks. Default seededRng("avatar-host"). | - |
| <a id="property-statsevery"></a> `statsEvery?` | `number` | Seconds between stats events. Default 1. | - |
| <a id="property-vrm-1"></a> `vrm?` | () => `Promise`\<`VrmHook`\> | The VRM hook, imported on the first .vrm: `() => import("@hackbuild/avatar/vrm").then((m) => m.vrmHook())`. Without it a VRM loads as plain glTF. | [`BodyLoadOptions`](#bodyloadoptions).[`vrm`](#property-vrm) |

***

### StageStats

Frames per second, frame count, draw calls, triangles and buffer size of a stage.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-calls"></a> `calls` | `number` | Draw calls and triangles of the last frame (three.js renderer info). |
| <a id="property-fps"></a> `fps` | `number` | Frames per second over the last window (measured from the loop clock). |
| <a id="property-frames"></a> `frames` | `number` | - |
| <a id="property-height"></a> `height` | `number` | - |
| <a id="property-pixelratio"></a> `pixelRatio` | `number` | - |
| <a id="property-triangles"></a> `triangles` | `number` | - |
| <a id="property-width"></a> `width` | `number` | Drawing buffer size in device pixels. |

## Type Aliases

### EnvironmentLoader

```ts
type EnvironmentLoader = (req, target) => Promise<LoadedEnvironment>;
```

Loads a scene preset onto a target; the default imports `@hackbuild/environment/three` on first use.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `req` | [`EnvironmentRequest`](#environmentrequest) |
| `target` | [`EnvironmentTarget`](#environmenttarget) |

#### Returns

`Promise`\<`LoadedEnvironment`\>

***

### StageEvent

```ts
type StageEvent = 
  | {
  body: Body;
  caps: BodyCaps;
  name: string;
  placeholder: boolean;
  type: "loaded";
  warnings: string[];
}
  | {
  cause: unknown;
  message: string;
  type: "failed";
}
  | {
  stats: StageStats;
  type: "stats";
}
  | {
  reasons: PauseReason[];
  running: boolean;
  type: "state";
}
  | {
  type: "lost";
}
  | {
  type: "restored";
};
```

What a stage reports: a body loaded or failed, stats, loop state, and the 3D context lost or restored.

## Variables

### LOST\_COPY

```ts
const LOST_COPY: "the 3d view was lost. press to restore." = "the 3d view was lost. press to restore.";
```

The line a stage shows when the browser drops its 3D context.

## Functions

### bodyAdapters()

```ts
function bodyAdapters(opts?): Record<BodyKind, Adapter<BodySource, Avatar, VrmHook | null>>;
```

The adapters a stage hosts: VRM with its hook imported on first use, the other kinds over the rig mapper.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts?` | [`BodyLoadOptions`](#bodyloadoptions) |

#### Returns

`Record`\<[`BodyKind`](index.md#bodykind), [`Adapter`](index.md#adapter)\<[`BodySource`](index.md#bodysource), `Avatar`, `VrmHook` \| `null`\>\>

***

### defineAvatarHost()

```ts
function defineAvatarHost(tag?, options?): CustomElementConstructor;
```

Defines the element once under `tag`, with stage options every instance shares. Returns its class.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `tag?` | `string` | `"hb-avatar-host"` |
| `options?` | [`StageOptions`](#stageoptions) | `{}` |

#### Returns

`CustomElementConstructor`

***

### loadBody()

```ts
function loadBody(
   src, 
   hook, 
   opts?
): Promise<Avatar>;
```

Loads one body source.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `src` | [`BodySource`](index.md#bodysource) |
| `hook` | `VrmHook` \| `null` |
| `opts?` | [`BodyLoadOptions`](#bodyloadoptions) |

#### Returns

`Promise`\<`Avatar`\>

***

### placeholderBody()

```ts
function placeholderBody(opts?): Avatar;
```

A placeholder body as an Avatar: format unknown, dialect placeholder, no clips, no morphs.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts?` | [`PlaceholderOptions`](#placeholderoptions) |

#### Returns

`Avatar`

***

### rigReady()

```ts
function rigReady(): Promise<unknown>;
```

The rig wasm, once per page; a failed load is tried again next time.

#### Returns

`Promise`\<`unknown`\>

***

### stagePixelRatio()

```ts
function stagePixelRatio(
   device, 
   max?, 
   scene?
): number;
```

Device pixels per CSS pixel: at most `max`, and at most 1.5 with a lit scene (vendor).

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `device` | `number` | `undefined` |
| `max?` | `number` | `2` |
| `scene?` | `boolean` | `false` |

#### Returns

`number`

***

### trackingManager()

```ts
function trackingManager(resolve?): object;
```

A manager that sends references through `resolve` and can wait for every item it started.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `resolve?` | (`ref`) => `string` \| `null` |

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `manager` | `LoadingManager` |
| `settled()` | () => `Promise`\<`void`\> |
