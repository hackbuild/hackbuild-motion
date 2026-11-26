# index

## Classes

### Blink

Spontaneous blinks with gaps from 1 to 8 s (median near 3 s, log normal,
inferred from published blink studies), 85 percent single,
a triangle lid curve that closes in 0.06 s and opens in 0.12 s. A gaze
shift can request a blink through `trigger`.

#### Constructors

##### Constructor

```ts
new Blink(rng, opts?): Blink;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `rng` | [`Rng`](#rng) |
| `opts?` | [`BlinkOptions`](#blinkoptions) |

###### Returns

[`Blink`](#blink)

#### Properties

| Property | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| <a id="property-count"></a> `count` | `number` | `0` | Blinks started so far. |
| <a id="property-weight"></a> `weight` | `number` | `0` | Lid weight, 0 open to 1 closed. |

#### Methods

##### trigger()

```ts
trigger(): void;
```

Starts a blink now unless one is running.

###### Returns

`void`

##### update()

```ts
update(dt): number;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `dt` | `number` |

###### Returns

`number`

***

### Breath

Breathing at a rate in breaths per minute with an inhale of 40 percent of
the cycle and a slower exhale. The rate drifts a little through an
Ornstein Uhlenbeck term so two characters never breathe in step.

#### Constructors

##### Constructor

```ts
new Breath(rng, rate?): Breath;
```

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `rng` | [`Rng`](#rng) | `undefined` |
| `rate?` | `number` | `14` |

###### Returns

[`Breath`](#breath)

#### Properties

| Property | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-depth"></a> `depth` | `number` | `1` |
| <a id="property-rate"></a> `rate` | `number` | `undefined` |

#### Methods

##### update()

```ts
update(dt): BreathState;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `dt` | `number` |

###### Returns

[`BreathState`](#breathstate)

***

### ClipPlayer

Layered clip player that writes every bone each frame: a base of idle and speed matched locomotion, a body layer and a masked upper body layer, with loop seams and idle handback.

#### Constructors

##### Constructor

```ts
new ClipPlayer(opts): ClipPlayer;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts` | [`ClipPlayerOptions`](#clipplayeroptions) |

###### Returns

[`ClipPlayer`](#clipplayer)

#### Properties

| Property | Modifier | Type | Default value | Description |
| ------ | ------ | ------ | ------ | ------ |
| <a id="property-bones"></a> `bones` | `readonly` | `number` | `undefined` | - |
| <a id="property-events"></a> `events` | `public` | [`PlayerEvent`](#playerevent)[] | `[]` | Events from the last update. |
| <a id="property-faces"></a> `faces` | `readonly` | `Map`\<`string`, `number`\> | `...` | This frame's expression weights from the clips' face tracks, each weighted by its layer weight; read after `update`. |
| <a id="property-pose"></a> `pose` | `readonly` | [`Pose`](#pose) | `undefined` | - |

#### Methods

##### layerWeight()

```ts
layerWeight(layer?): number;
```

Weight of the body layer over the base, 0 when the idle has the body.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `layer?` | [`Layer`](#layer) | `"body"` |

###### Returns

`number`

##### loopPlan()

```ts
loopPlan(c): LoopPlan;
```

The loop plan the player uses for a clip (seam width and restart).

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `c` | [`Clip`](#clip) |

###### Returns

[`LoopPlan`](#loopplan-1)

##### play()

```ts
play(clip, opts?): number;
```

Starts a clip on a layer. Returns a ticket; a later play on the same layer replaces or queues it.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `clip` | [`Clip`](#clip) |
| `opts?` | [`PlayOptions`](#playoptions) |

###### Returns

`number`

##### release()

```ts
release(layer?, fade?): void;
```

Releases a held pose or a running loop on a layer: it fades back.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `layer?` | [`Layer`](#layer) | `"body"` |
| `fade?` | `number` | `undefined` |

###### Returns

`void`

##### setLocomotion()

```ts
setLocomotion(speed): void;
```

Ground speed in m/s that the base layer matches.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `speed` | `number` |

###### Returns

`void`

##### stop()

```ts
stop(layer?, fade?): void;
```

Drops everything on a layer, queued plays too.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `layer?` | [`Layer`](#layer) | `"body"` |
| `fade?` | `number` | `undefined` |

###### Returns

`void`

##### update()

```ts
update(dt): Pose;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `dt` | `number` |

###### Returns

[`Pose`](#pose)

***

### Face

The face driver: eases moods toward their targets, rests at a slight smile, and writes lid, mouth and clip face weights to one expression sink.

#### Constructors

##### Constructor

```ts
new Face(sink, opts?): Face;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `sink` | [`ExpressionSink`](#expressionsink) |
| `opts?` | [`FaceOptions`](#faceoptions) |

###### Returns

[`Face`](#face)

#### Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="property-mouth"></a> `mouth` | `readonly` | [`ExpressionSink`](#expressionsink) | Mouth shapes from speech for this frame; call lipsync's `drive` on it before `update`. |

#### Accessors

##### blink

###### Get Signature

```ts
get blink(): boolean;
```

###### Returns

`boolean`

###### Set Signature

```ts
set blink(on): void;
```

Blinking on or off; turning it off mid blink writes the lid open at once.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `on` | `boolean` |

###### Returns

`void`

#### Methods

##### lid()

```ts
lid(weight): void;
```

The lid weight for this frame, 0 open to 1 closed (from Blink or the gaze controller).

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `weight` | `number` |

###### Returns

`void`

##### set()

```ts
set(name, weight?): void;
```

Holds one mood at `weight`; null hands the face back to the resting weights.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `name` | `string` \| `null` | `undefined` |
| `weight?` | `number` | `1` |

###### Returns

`void`

##### setResting()

```ts
setResting(weights): void;
```

The weights a quiet face rests at.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `weights` | `Readonly`\<`Record`\<`string`, `number`\>\> |

###### Returns

`void`

##### settling()

```ts
settling(): boolean;
```

True while a mood is still easing toward its target.

###### Returns

`boolean`

##### update()

```ts
update(dt, clipFaces?): void;
```

One frame: eases moods, then writes every channel once. Mouth shapes
from speech win their channels; other channels show the larger of the
clip weight (`clipFaces`, this frame) and the mood; a channel the clip
let go of returns to the mood.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `dt` | `number` |
| `clipFaces?` | `ReadonlyMap`\<`string`, `number`\> |

###### Returns

`void`

##### value()

```ts
value(name): number;
```

The weight last written for a name.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |

###### Returns

`number`

***

### GazeController

Where the eyes and head point each frame, with aversion episodes, saccades, head recruitment, clamped eye aim, blinks and a seam hold behind the body.

#### Constructors

##### Constructor

```ts
new GazeController(opts): GazeController;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts` | [`GazeOptions`](#gazeoptions) |

###### Returns

[`GazeController`](#gazecontroller)

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-blinker"></a> `blinker` | `readonly` | [`Blink`](#blink) |

#### Methods

##### setMode()

```ts
setMode(mode): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `mode` | [`GazeMode`](#gazemode) |

###### Returns

`void`

##### setTarget()

```ts
setTarget(p): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `p` | [`Vec3`](#vec3) \| `null` |

###### Returns

`void`

##### update()

```ts
update(
   dt, 
   eye, 
   bodyYaw
): GazeOutput;
```

One step. `eye` is the point between the eyes in world space, `bodyYaw`
the facing of the body. With no target the gaze rests ahead and a
little down.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `dt` | `number` |
| `eye` | [`Vec3`](#vec3) |
| `bodyYaw` | `number` |

###### Returns

[`GazeOutput`](#gazeoutput)

***

### HeadLevel

Head level: mocap idles hold the head 10 to 20 degrees down, which reads
as a glare once the eyes aim at a face. The clip's head pitch is low
passed (1.2 s halflife) and the head lifted by the slow part only, up to
`maxLift` (10 degrees), so nods still pass and a slump still reads.

#### Constructors

##### Constructor

```ts
new HeadLevel(maxLift?, halflife?): HeadLevel;
```

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `maxLift?` | `number` | `...` |
| `halflife?` | `number` | `1.2` |

###### Returns

[`HeadLevel`](#headlevel)

#### Properties

| Property | Modifier | Type | Default value |
| ------ | ------ | ------ | ------ |
| <a id="property-halflife"></a> `halflife` | `public` | `number` | `1.2` |
| <a id="property-maxlift"></a> `maxLift` | `public` | `number` | `...` |

#### Methods

##### apply()

```ts
apply(
   dt, 
   pose, 
   head
): number;
```

Reads the head pitch from a pose and lifts it in place, about the parent X axis.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `dt` | `number` |
| `pose` | [`Pose`](#pose) |
| `head` | `number` |

###### Returns

`number`

##### update()

```ts
update(dt, clipPitch): number;
```

Takes the head pitch the clip produced (radians, up positive) and returns the lift to add.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `dt` | `number` |
| `clipPitch` | `number` |

###### Returns

`number`

***

### IdleScheduler

Idle scheduler: a postural change about every 20 s, half fidgets, a third
weight shifts, the rest easing back to centre (Duarte and Zatsiorsky,
vendor), and face touches about 23 an hour (Kwok 2015, vendor). Leaving
idle cancels running events and centres the weight.

#### Constructors

##### Constructor

```ts
new IdleScheduler(
   rng, 
   changeRate?, 
   faceRate?
): IdleScheduler;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `rng` | [`Rng`](#rng) |
| `changeRate?` | `number` |
| `faceRate?` | `number` |

###### Returns

[`IdleScheduler`](#idlescheduler)

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-changerate"></a> `changeRate` | `public` | `number` |
| <a id="property-facerate"></a> `faceRate` | `public` | `number` |

#### Methods

##### update()

```ts
update(dt, idle): IdleState;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `dt` | `number` |
| `idle` | `boolean` |

###### Returns

[`IdleState`](#idlestate)

***

### SeamHold

Hysteresis across the atan2 seam behind the body. A relative yaw past
`limit` that flips sign while the previous value was also past `limit`
keeps the previous sign, so a target crossing directly behind does not
whip the head 180 degrees. The held value continues past pi; it lets go
once the raw yaw comes back inside `limit` on either side.

#### Constructors

##### Constructor

```ts
new SeamHold(limit?): SeamHold;
```

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `limit?` | `number` | `2.2` |

###### Returns

[`SeamHold`](#seamhold)

#### Properties

| Property | Modifier | Type | Default value |
| ------ | ------ | ------ | ------ |
| <a id="property-limit"></a> `limit` | `public` | `number` | `2.2` |
| <a id="property-value"></a> `value` | `public` | `number` | `0` |

#### Methods

##### reset()

```ts
reset(value?): void;
```

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `value?` | `number` | `0` |

###### Returns

`void`

##### update()

```ts
update(raw): number;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `raw` | `number` |

###### Returns

`number`

## Interfaces

### BlinkOptions

Gap, single or double share, and lid timing of spontaneous blinks.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-close"></a> `close?` | `number` | Lid close and open times in seconds. |
| <a id="property-maxgap"></a> `maxGap?` | `number` | - |
| <a id="property-mingap"></a> `minGap?` | `number` | Shortest and longest gap between blinks in seconds. |
| <a id="property-open"></a> `open?` | `number` | - |
| <a id="property-single"></a> `single?` | `number` | Share of blinks that come alone; the rest come as a double. |

***

### BreathState

One breathing frame: cycle phase, lung fill, chest pitch and shoulder rise.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-chestpitch"></a> `chestPitch` | `number` | Chest pitch in radians (positive lifts the chest). |
| <a id="property-fill"></a> `fill` | `number` | Lung fill, 0 empty to 1 full. |
| <a id="property-phase"></a> `phase` | `number` | Phase in the cycle, 0 to 1, 0 at the start of an inhale. |
| <a id="property-shoulderrise"></a> `shoulderRise` | `number` | Shoulder rise in meters. |

***

### Clip

A clip on flat arrays: local bone rotations per frame, an optional root track and optional face tracks.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-bones-1"></a> `bones` | `number` | - |
| <a id="property-faces-1"></a> `faces?` | [`ClipFace`](#clipface)[] | Expression tracks, one weight per frame each, handed to the face rather than written to bones. |
| <a id="property-fps"></a> `fps` | `number` | - |
| <a id="property-frames"></a> `frames` | `number` | - |
| <a id="property-loop"></a> `loop` | `boolean` | - |
| <a id="property-name"></a> `name` | `string` | - |
| <a id="property-root"></a> `root?` | `Float32Array`\<`ArrayBufferLike`\> | frames * 3 root (hips) positions, optional. |
| <a id="property-rotations"></a> `rotations` | `Float32Array` | frames * bones * 4 local rotations. |

***

### ClipFace

One expression track of a clip, a weight per frame.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-name-1"></a> `name` | `string` | Expression or morph name. |
| <a id="property-weights"></a> `weights` | `Float32Array` | frames weights, 0 to 1. |

***

### ClipPlayerOptions

The idle clip, locomotion loops by speed, the upper body bone set and seam options of a clip player.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-idle"></a> `idle` | [`Clip`](#clip) | - |
| <a id="property-locomotion"></a> `locomotion?` | [`LocomotionEntry`](#locomotionentry)[] | Locomotion loops by recorded speed; blended by speed with a shared phase. |
| <a id="property-seam"></a> `seam?` | [`SeamOptions`](#seamoptions) | - |
| <a id="property-upperbones"></a> `upperBones?` | readonly `number`[] | Bone indices the upper layer writes. |

***

### ExpressionSink

What the face writes to: a preset or morph name and a weight.

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

### FaceOptions

Easing rate, resting weights and lid channel name of a face.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-lid"></a> `lid?` | `string` | Name of the lid channel. Default "blink". |
| <a id="property-rate-1"></a> `rate?` | `number` | Easing rate per second: a mood reaches 1 - 1/e (0.63) of its target in 1/rate s. Default 8 (vendor). |
| <a id="property-resting"></a> `resting?` | `Readonly`\<`Record`\<`string`, `number`\>\> | Weights with no mood set. Default RESTING_FACE; pass \{\} for a neutral face. |

***

### GazeOptions

Random source, eye and head ranges, spring halflife and the organic switch of a gaze controller.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-blink"></a> `blink?` | [`BlinkOptions`](#blinkoptions) | - |
| <a id="property-eyeonlydeg"></a> `eyeOnlyDeg?` | `number` | Half width of the range the eyes cover alone before the head joins, degrees. |
| <a id="property-eyepitchdeg"></a> `eyePitchDeg?` | `number` | - |
| <a id="property-eyeyawdeg"></a> `eyeYawDeg?` | `number` | Eye limits from where the head points, degrees. |
| <a id="property-headhalflife"></a> `headHalflife?` | `number` | Head spring halflife in seconds. |
| <a id="property-headpitchdown"></a> `headPitchDown?` | `number` | - |
| <a id="property-headpitchup"></a> `headPitchUp?` | `number` | - |
| <a id="property-headslope"></a> `headSlope?` | `number` | Head share of the gaze past the eye only range (Stahl 1999 reports about 0.77, vendor). |
| <a id="property-headyawlimit"></a> `headYawLimit?` | `number` | Head limits from the body, radians. |
| <a id="property-organic"></a> `organic?` | `boolean` | Aversion and saccades on (the organic layer); off gives a plain stare. |
| <a id="property-rng"></a> `rng` | [`Rng`](#rng) | - |
| <a id="property-seamlimit"></a> `seamLimit?` | `number` | Yaw past which the seam hold keeps the previous side, radians. |

***

### GazeOutput

One gaze frame: head and eye angles, world direction, lid weight, aversion flag and the body turn asked for.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-averted"></a> `averted` | `boolean` | True while an aversion episode holds the gaze off the target. |
| <a id="property-blink-1"></a> `blink` | `number` | Lid weight, 0 open to 1 closed. |
| <a id="property-bodyturn"></a> `bodyTurn` | `number` | Yaw the body should turn by, radians, when the target sits past the head range (behind the body). Zero otherwise. |
| <a id="property-direction"></a> `direction` | \[`number`, `number`, `number`\] | World gaze direction. |
| <a id="property-eyepitch"></a> `eyePitch` | `number` | - |
| <a id="property-eyeyaw"></a> `eyeYaw` | `number` | Eye angles from the head, radians, inside the eye limits. |
| <a id="property-headpitch"></a> `headPitch` | `number` | - |
| <a id="property-headyaw"></a> `headYaw` | `number` | Head angles from the body, radians. |
| <a id="property-targetyaw"></a> `targetYaw` | `number` | Target yaw from the body after the seam hold, radians. |

***

### IdleEvent

One idle action the scheduler started: a fidget, weight shift or face touch, with its timing and side.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-at"></a> `at` | `number` | Seconds since the scheduler started. |
| <a id="property-duration"></a> `duration` | `number` | - |
| <a id="property-kind"></a> `kind` | [`IdleKind`](#idlekind) | - |
| <a id="property-mouth-1"></a> `mouth?` | `boolean` | For a face touch: the mouth (true) or the cheek (false). |
| <a id="property-shift"></a> `shift?` | `number` | Weight shift target in meters (signed, along the body's right axis). |
| <a id="property-side"></a> `side` | `"L"` \| `"R"` | - |

***

### IdleState

What the idle scheduler started this step, what runs with its weight, and the current weight shift.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-active"></a> `active` | `object`[] | Running events with their weight, 0 to 1. |
| <a id="property-shift-1"></a> `shift` | `number` | Current lateral weight shift target, meters. |
| <a id="property-started"></a> `started` | [`IdleEvent`](#idleevent)[] | Events that started this step. |

***

### LocomotionEntry

A locomotion loop and the speed it was recorded at, in meters per second.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-clip"></a> `clip` | [`Clip`](#clip) | - |
| <a id="property-speed"></a> `speed` | `number` | Speed the clip was recorded at, m/s. |

***

### LoopPlan

How a loop wraps: the blend window and the time it restarts from.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-blend"></a> `blend` | `number` |
| <a id="property-restart"></a> `restart` | `number` |
| <a id="property-seamdeg"></a> `seamDeg` | `number` |

***

### PlayerEvent

A clip player event: a clip started, ended, or handed back to the base layer.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-layer"></a> `layer` | [`Layer`](#layer) |
| <a id="property-name-2"></a> `name` | `string` |
| <a id="property-ticket"></a> `ticket` | `number` |
| <a id="property-type"></a> `type` | `"started"` \| `"ended"` \| `"handback"` |

***

### PlayOptions

Layer, loop, fade, hold, speed and queue policy of one play call.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-background"></a> `background?` | `boolean` | A loop marked background waits for a running one shot instead of cutting it. |
| <a id="property-fade"></a> `fade?` | `number` | Fade time in seconds, 0.08 to 0.15 s reads as a natural transition. Default 0.12. |
| <a id="property-hold"></a> `hold?` | `number` | Seconds to hold the last frame of a one shot before handing back. Infinity holds until release. |
| <a id="property-layer-1"></a> `layer?` | [`Layer`](#layer) | - |
| <a id="property-loop-1"></a> `loop?` | `boolean` | Loop the clip; defaults to the clip's own flag. |
| <a id="property-loopfor"></a> `loopFor?` | `number` | Seconds to keep a loop running before handing back. |
| <a id="property-policy"></a> `policy?` | `"replace"` \| `"queue"` | replace fades out what the layer plays; queue waits for it to finish. Default replace. |
| <a id="property-speed-1"></a> `speed?` | `number` | - |

***

### PointPhase

One frame of a pointing gesture: arm weight toward the target and the apex and done flags.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-apex"></a> `apex` | `boolean` | True on the frame (and after) the arm reaches the apex. |
| <a id="property-done"></a> `done` | `boolean` | - |
| <a id="property-weight-1"></a> `weight` | `number` | Arm weight toward the target, 0 to 1. |

***

### Pose

A pose on flat arrays: local rotations per bone, x y z w, and the root position.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-root-1"></a> `root` | `Float32Array` |
| <a id="property-rotations-1"></a> `rotations` | `Float32Array` |

***

### ReachPlan

Timing of one reach: seconds to the target, hold and retract.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-duration-1"></a> `duration` | `number` | Seconds to the target. |
| <a id="property-hold-1"></a> `hold` | `number` | Seconds at the target before the release. |
| <a id="property-retract"></a> `retract` | `number` | Seconds back to rest. |

***

### SeamOptions

When a loop seam gets a blend, and how many seconds are blended.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-blend-1"></a> `blend?` | `number` | Seconds blended at the end. Default 0.4. |
| <a id="property-thresholddeg"></a> `thresholdDeg?` | `number` | Seams wider than this (degrees) get the blend. Default 2. |

***

### ThrowPlan

Timing and effort of one throw: phase ends, body lags, aim error and distance factor.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-aimerror"></a> `aimError` | `number` | Aim error in radians and a distance factor around 1. |
| <a id="property-cock"></a> `cock` | `number` | - |
| <a id="property-decel"></a> `decel` | `number` | - |
| <a id="property-distance"></a> `distance` | `number` | - |
| <a id="property-effort"></a> `effort` | `number` | - |
| <a id="property-lagpelvis"></a> `lagPelvis` | `number` | Pelvis and thorax lags that swap the textbook order on some throws. |
| <a id="property-lagthorax"></a> `lagThorax` | `number` | - |
| <a id="property-release"></a> `release` | `number` | - |
| <a id="property-stride"></a> `stride` | `number` | End of stride, cocking, acceleration (release), deceleration, in seconds. |
| <a id="property-t"></a> `T` | `number` | Total time in seconds. |

***

### ThrowPose

One frame of a throw: pelvis, thorax, shoulder, elbow and lean angles, with release and done flags.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-done-1"></a> `done` | `boolean` | - |
| <a id="property-elbow"></a> `elbow` | `number` | Elbow flexion, radians (negative bends). |
| <a id="property-lean"></a> `lean` | `number` | Forward lean, radians. |
| <a id="property-pelvis"></a> `pelvis` | `number` | Pelvis and thorax yaw toward the throw, radians. |
| <a id="property-released"></a> `released` | `boolean` | - |
| <a id="property-shoulder"></a> `shoulder` | `number` | Throwing shoulder swing angle along the arc, radians (0 rest, 2 pi back at rest). |
| <a id="property-thorax"></a> `thorax` | `number` | - |

## Type Aliases

### GazeMode

```ts
type GazeMode = "listen" | "talk" | "think";
```

The conversation state that sets aversion timing: listen, talk or think.

***

### IdleKind

```ts
type IdleKind = "fidget" | "weightShift" | "faceTouch";
```

The kinds of idle action: fidget, weight shift or face touch.

***

### Layer

```ts
type Layer = "body" | "upper";
```

A clip player layer: the whole body, or the masked upper body.

***

### QuatArray

```ts
type QuatArray = Float32Array | Float64Array | number[];
```

A flat array of quaternions, x y z w.

***

### Rng

```ts
type Rng = () => number;
```

Uniform numbers in [0, 1). The family contract: injected, never Math.random.

#### Returns

`number`

***

### Vec3

```ts
type Vec3 = readonly [number, number, number];
```

A point or direction as x, y, z in the normalized humanoid space.

## Variables

### DEG

```ts
const DEG: number;
```

Radians per degree.

***

### POINT\_TIMING

```ts
const POINT_TIMING: object;
```

Pointing timing after Peeters 2013 (vendor): onset 0.53 s, the arm
travels for 0.83 s, apex at 1.37 s, hold about 1.2 s. The 0.6 s retract
is inferred. `t` is seconds since the gesture began.

#### Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-apex-1"></a> `apex` | `1.37` | `1.37` |
| <a id="property-end"></a> `end` | `3.3` | `3.3` |
| <a id="property-holdend"></a> `holdEnd` | `2.56` | `2.56` |
| <a id="property-onset"></a> `onset` | `0.53` | `0.53` |
| <a id="property-retract-1"></a> `retract` | `0.6` | `0.6` |
| <a id="property-travel"></a> `travel` | `0.83` | `0.83` |

***

### RELAXED

```ts
const RELAXED: Readonly<Record<string, number>>;
```

Radians about the body's forward axis, per bone.

***

### RESTING\_FACE

```ts
const RESTING_FACE: Readonly<Record<string, number>>;
```

The weights a quiet face rests at (vendor).

***

### TAU

```ts
const TAU: number;
```

Two pi, one full turn in radians.

## Functions

### blendPose()

```ts
function blendPose(
   a, 
   b, 
   w, 
   out, 
   mask?
): void;
```

out = slerp(a, b, w) per bone, root lerped. `out` may alias `a`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `a` | [`Pose`](#pose) |
| `b` | [`Pose`](#pose) |
| `w` | `number` |
| `out` | [`Pose`](#pose) |
| `mask?` | `Uint8Array`\<`ArrayBufferLike`\> |

#### Returns

`void`

***

### clamp()

```ts
function clamp(
   x, 
   lo, 
   hi
): number;
```

Clamps a number to the range lo to hi.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `x` | `number` |
| `lo` | `number` |
| `hi` | `number` |

#### Returns

`number`

***

### clipDuration()

```ts
function clipDuration(c): number;
```

Length of a clip in seconds, from its frame count and rate.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `c` | [`Clip`](#clip) |

#### Returns

`number`

***

### copyPose()

```ts
function copyPose(from, to): void;
```

Copies the rotations and root of one pose into another of the same size.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `from` | [`Pose`](#pose) |
| `to` | [`Pose`](#pose) |

#### Returns

`void`

***

### createPose()

```ts
function createPose(bones): Pose;
```

A pose of the given bone count with every rotation at identity and the root at the origin.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `bones` | `number` |

#### Returns

[`Pose`](#pose)

***

### direction()

```ts
function direction(yaw, pitch): [number, number, number];
```

Unit direction for a yaw and pitch.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `yaw` | `number` |
| `pitch` | `number` |

#### Returns

\[`number`, `number`, `number`\]

***

### planLoop()

```ts
function planLoop(c, opts?): LoopPlan;
```

How a loop wraps: the seam width in degrees, the blend window and the restart time.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `c` | [`Clip`](#clip) |
| `opts?` | [`SeamOptions`](#seamoptions) |

#### Returns

[`LoopPlan`](#loopplan-1)

***

### planReach()

```ts
function planReach(
   distance, 
   rng, 
   hold?
): ReachPlan;
```

A reach plan whose duration grows with distance in the manner of Fitts'
law: 0.35 s plus 0.12 s per bit of log2(1 + distance / 0.04) (constants
inferred), with a small seeded spread.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `distance` | `number` | `undefined` |
| `rng` | [`Rng`](#rng) | `undefined` |
| `hold?` | `number` | `0.4` |

#### Returns

[`ReachPlan`](#reachplan)

***

### planThrow()

```ts
function planThrow(effort, rng): ThrowPlan;
```

A throw as a proximal to distal chain. Phase shares after Owens 2024
(vendor): stride 37, cocking 14, acceleration 3, deceleration 20,
follow through 26 percent. Segment timing is jittered per throw and the
pelvis and thorax order swaps on 30 percent of throws (inferred from
reports that real throwers rarely keep the textbook order).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `effort` | `number` |
| `rng` | [`Rng`](#rng) |

#### Returns

[`ThrowPlan`](#throwplan)

***

### pointGesture()

```ts
function pointGesture(t): PointPhase;
```

The pointing gesture at `t` seconds since it began: arm weight, apex and done.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `t` | `number` |

#### Returns

[`PointPhase`](#pointphase)

***

### quatAngle()

```ts
function quatAngle(
   q, 
   a, 
   r, 
   b
): number;
```

Angle in radians between two unit quaternions.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `q` | [`QuatArray`](#quatarray) |
| `a` | `number` |
| `r` | [`QuatArray`](#quatarray) |
| `b` | `number` |

#### Returns

`number`

***

### quatPitch()

```ts
function quatPitch(q, a): number;
```

Pitch about +X of a unit quaternion, radians, positive when +Z tips up.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `q` | [`QuatArray`](#quatarray) |
| `a` | `number` |

#### Returns

`number`

***

### reachWeight()

```ts
function reachWeight(t, plan): number;
```

Weight of a reach at `t` seconds: minimum jerk in, hold, minimum jerk out.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `t` | `number` |
| `plan` | [`ReachPlan`](#reachplan) |

#### Returns

`number`

***

### restStance()

```ts
function restStance(names, rest?): Clip;
```

A two frame loop of the rest stance over `names`, for bones whose rest
frames line up with the body (VRM normalized bones, the placeholder).
`rest` holds local rest rotations (names.length * 4); default identity.
Bones with other rest frames go through `restStanceFromThree`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `names` | readonly `string`[] |
| `rest?` | `ArrayLike`\<`number`\> |

#### Returns

[`Clip`](#clip)

***

### sampleClip()

```ts
function sampleClip(
   c, 
   t, 
   out, 
   mask?
): void;
```

Samples a clip at clip time `t` (clamped), slerping between frames.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `c` | [`Clip`](#clip) |
| `t` | `number` |
| `out` | [`Pose`](#pose) |
| `mask?` | `Uint8Array`\<`ArrayBufferLike`\> |

#### Returns

`void`

***

### sampleFace()

```ts
function sampleFace(
   c, 
   face, 
   t
): number;
```

A face track's weight at time `t` seconds, linear between frames, clamped to the ends.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `c` | [`Clip`](#clip) |
| `face` | [`ClipFace`](#clipface) |
| `t` | `number` |

#### Returns

`number`

***

### sampleLoop()

```ts
function sampleLoop(
   c, 
   plan, 
   t, 
   out, 
   mask?
): void;
```

Samples a loop at play time `t` (seconds since it started). With a seam
blend the last `blend` seconds slerp toward the frames at the start of
the clip, and every cycle after the first restarts at `blend`, where the
blended end lands, so the wrap has no jump.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `c` | [`Clip`](#clip) |
| `plan` | [`LoopPlan`](#loopplan-1) |
| `t` | `number` |
| `out` | [`Pose`](#pose) |
| `mask?` | `Uint8Array`\<`ArrayBufferLike`\> |

#### Returns

`void`

***

### seamDegrees()

```ts
function seamDegrees(c): number;
```

Largest bone rotation difference between the first and last frame, degrees.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `c` | [`Clip`](#clip) |

#### Returns

`number`

***

### slerpInto()

```ts
function slerpInto(
   q, 
   a, 
   r, 
   b, 
   t, 
   out, 
   o
): void;
```

Shortest arc slerp of q[a..a+4] and r[b..b+4] into out[o..o+4].

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `q` | [`QuatArray`](#quatarray) |
| `a` | `number` |
| `r` | [`QuatArray`](#quatarray) |
| `b` | `number` |
| `t` | `number` |
| `out` | [`QuatArray`](#quatarray) |
| `o` | `number` |

#### Returns

`void`

***

### throwPose()

```ts
function throwPose(plan, t): ThrowPose;
```

The throw curves at `t` seconds into a plan.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `plan` | [`ThrowPlan`](#throwplan) |
| `t` | `number` |

#### Returns

[`ThrowPose`](#throwpose)

***

### wrapAngle()

```ts
function wrapAngle(a): number;
```

Wraps to (-pi, pi].

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `a` | `number` |

#### Returns

`number`

***

### yawPitch()

```ts
function yawPitch(from, to): [number, number];
```

Yaw and pitch of the direction from `from` to `to`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `from` | [`Vec3`](#vec3) |
| `to` | [`Vec3`](#vec3) |

#### Returns

\[`number`, `number`\]
