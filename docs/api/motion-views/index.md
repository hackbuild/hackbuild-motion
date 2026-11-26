# index

## Interfaces

### ClipItem

One clip as the strip shows it: id, name, length, loop, source, tags, warning and still.

#### Extended by

- [`StripItem`](vanilla.md#stripitem)

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-from"></a> `from` | [`ClipFrom`](#clipfrom) | - |
| <a id="property-id"></a> `id` | `string` | - |
| <a id="property-loop"></a> `loop` | `boolean` | - |
| <a id="property-name"></a> `name` | `string` | - |
| <a id="property-seconds"></a> `seconds` | `number` | Length in seconds. |
| <a id="property-tags"></a> `tags?` | `string`[] | Words for what the body does: walk, wave, nod. |
| <a id="property-thumb"></a> `thumb?` | `string` \| `Blob` | A thumbnail: an image URL or a PNG Blob. The strip draws one from `clip` when this is missing. |
| <a id="property-warn"></a> `warn?` | `string` | A problem a person should see before they pick it: "the loop jumps 14 degrees at the seam". |

***

### FindingsLike

What retarget's analyzeMotion returns, in the fields the strip reads.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-duration"></a> `duration` | `number` |
| <a id="property-looping"></a> `looping` | `boolean` |
| <a id="property-tags-1"></a> `tags` | readonly `string`[] |

***

### LicenceMeta

VRM metadata fields the licence line reads (VRM 1.0 and 0.x).

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-allowredistribution"></a> `allowRedistribution?` | `boolean` |
| <a id="property-commercialusage"></a> `commercialUsage?` | `string` |
| <a id="property-licensename"></a> `licenseName?` | `string` |
| <a id="property-licenseurl"></a> `licenseUrl?` | `string` |
| <a id="property-metaversion"></a> `metaVersion?` | `string` |
| <a id="property-modification"></a> `modification?` | `string` |
| <a id="property-otherlicenseurl"></a> `otherLicenseUrl?` | `string` |

***

### PackLike

What bake's decodePack returns, in the fields the strip reads.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-clips"></a> `clips` | `Record`\<`string`, \{ `dur`: `number`; `loop`: `boolean`; `n`: `number`; `name`: `string`; \}\> |
| <a id="property-fps"></a> `fps` | `number` |

***

### PackReportLike

What bake's bakeClips reports per clip, in the fields the strip reads.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-maxangleerrordeg"></a> `maxAngleErrorDeg` | `number` |
| <a id="property-name-1"></a> `name` | `string` |
| <a id="property-seamangledeg"></a> `seamAngleDeg` | `number` \| `null` |
| <a id="property-seamok"></a> `seamOk` | `boolean` \| `null` |

***

### RigCheck

The rig check: overall tone, a headline and the lines worst first.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-head"></a> `head` | `string` | The headline: "ready to act", "ready, with limits", "cannot act". |
| <a id="property-lines"></a> `lines` | [`RigLine`](#rigline)[] | - |
| <a id="property-tone"></a> `tone` | [`RigTone`](#rigtone) | - |

***

### RigFacts

What a loaded body can do, as @hackbuild/avatar-host reports it in BodyCaps.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-blink"></a> `blink` | `boolean` | - |
| <a id="property-bones"></a> `bones` | readonly `string`[] | Humanoid bones the mapper found, by VRM 1.0 name. |
| <a id="property-clips-1"></a> `clips` | readonly `string`[] | Clip names inside the file. |
| <a id="property-expressions"></a> `expressions` | readonly `string`[] | Expression names the face carries. |
| <a id="property-gaze"></a> `gaze` | `boolean` | - |
| <a id="property-mouth"></a> `mouth` | `boolean` | - |
| <a id="property-warnings"></a> `warnings?` | readonly `string`[] | Load warnings from the avatar package, already in plain words. |

***

### RigLine

One line of the rig check: what works or what does not, and why.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-text"></a> `text` | `string` |
| <a id="property-tone-1"></a> `tone` | [`RigTone`](#rigtone) |

***

### SizeFacts

The facts the size line reads: bytes, format, file and triangle counts.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-bytes"></a> `bytes` | `number` | Every file of the drop, model and textures. |
| <a id="property-files"></a> `files?` | `number` | - |
| <a id="property-format"></a> `format` | `string` | vrm, glb, gltf or fbx. |
| <a id="property-triangles"></a> `triangles?` | `number` | - |

***

### Speech

Something to say. Give audio for real speech; text alone is spoken on estimated timings with no sound.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-audio"></a> `audio?` | `AudioBuffer` \| `HTMLMediaElement` | - |
| <a id="property-events"></a> `events?` | readonly `SpeechEvent`[] | Lipsync events timed from the start of the audio, as `fromSpans` of the bellows adapter makes them. |
| <a id="property-phonemes"></a> `phonemes?` | readonly [`SpeechTiming`](#speechtiming)[] | - |
| <a id="property-text-1"></a> `text?` | `string` | - |
| <a id="property-words"></a> `words?` | readonly [`SpeechTiming`](#speechtiming)[] | - |

***

### SpeechTiming

A word or phoneme with its time from the start of the audio, as @hackbuild/speak reports it.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-end"></a> `end?` | `number` | - |
| <a id="property-phoneme"></a> `phoneme?` | `string` | A phoneme symbol (ARPAbet), for a phoneme timing. |
| <a id="property-start"></a> `start?` | `number` | Character offsets in `text`, for a word. |
| <a id="property-t0"></a> `t0` | `number` | - |
| <a id="property-t1"></a> `t1` | `number` | - |
| <a id="property-text-2"></a> `text?` | `string` | The word, when the offsets are not given. |

## Type Aliases

### ClipFrom

```ts
type ClipFrom = "bake" | "retarget" | "body" | "code";
```

Where a clip came from: a baked pack, a retarget, the body's own file, or code.

***

### RigTone

```ts
type RigTone = "ok" | "warn" | "bad";
```

How a rig check line reads: fine, a limit, or a blocker.

***

### SpeechSource

```ts
type SpeechSource = "events" | "phonemes" | "words" | "estimate" | "audio level";
```

Where the mouth timings come from, for the readout and the tests.

## Functions

### bytesWord()

```ts
function bytesWord(n): string;
```

Bytes as "820 kb" or "12.4 mb".

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `n` | `number` |

#### Returns

`string`

***

### clipFromFindings()

```ts
function clipFromFindings(
   id, 
   name, 
   f
): ClipItem;
```

An item from a retargeted motion and its findings.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |
| `name` | `string` |
| `f` | [`FindingsLike`](#findingslike) |

#### Returns

[`ClipItem`](#clipitem)

***

### clipMeta()

```ts
function clipMeta(c): string;
```

The strip's second line: "2.4 s, loops" or "walk, 2.4 s, loops".

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `c` | `Pick`\<[`ClipItem`](#clipitem), `"seconds"` \| `"loop"` \| `"tags"`\> |

#### Returns

`string`

***

### clipsFromBody()

```ts
function clipsFromBody(clips, prefix?): ClipItem[];
```

Items for the clips a loaded file carries, by name and length.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `clips` | readonly `object`[] | `undefined` |
| `prefix?` | `string` | `"body"` |

#### Returns

[`ClipItem`](#clipitem)[]

***

### clipsFromPack()

```ts
function clipsFromPack(
   pack, 
   report?, 
   prefix?
): ClipItem[];
```

Items from a clip pack, with the bake report's seam check as a warning.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `pack` | [`PackLike`](#packlike) | `undefined` |
| `report?` | readonly [`PackReportLike`](#packreportlike)[] | `[]` |
| `prefix?` | `string` | `"pack"` |

#### Returns

[`ClipItem`](#clipitem)[]

***

### estimateSeconds()

```ts
function estimateSeconds(text): number;
```

Seconds text takes on estimated timings: about 0.34 s a word (inferred), at least 0.8 s.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

#### Returns

`number`

***

### licenceLine()

```ts
function licenceLine(format, meta): RigLine;
```

The licence line. A file with no metadata says so instead of guessing.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `format` | `string` |
| `meta` | [`LicenceMeta`](#licencemeta) \| `null` \| `undefined` |

#### Returns

[`RigLine`](#rigline)

***

### nextClip()

```ts
function nextClip(
   items, 
   id, 
   step?
): string | null;
```

The next id after `id` in the strip, wrapping, for a key or a play all.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `items` | readonly [`ClipItem`](#clipitem)[] | `undefined` |
| `id` | `string` \| `null` | `undefined` |
| `step?` | `number` | `1` |

#### Returns

`string` \| `null`

***

### rigCheck()

```ts
function rigCheck(f): RigCheck;
```

The rig check in plain words, worst first.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `f` | [`RigFacts`](#rigfacts) |

#### Returns

[`RigCheck`](#rigcheck)

***

### secondsWord()

```ts
function secondsWord(s): string;
```

A clip's length: "2.4 s", "0.5 s", "1 min 12 s".

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `s` | `number` |

#### Returns

`string`

***

### sizeLine()

```ts
function sizeLine(s): string;
```

The size line: "12.4 mb vrm, 3 files, 38 k triangles".

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `s` | [`SizeFacts`](#sizefacts) |

#### Returns

`string`

***

### speechEvents()

```ts
function speechEvents(
   s, 
   t0, 
   seconds
): object;
```

The mouth events for a speech starting at `t0` on the mouth clock and
lasting `seconds`, closed by an end event, and where they came from.
Timings win in the order events, phonemes, words; text alone is
estimated only when there is no audio, since audio drives the mouth by
its level when no timings come with it.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `s` | [`Speech`](#speech) |
| `t0` | `number` |
| `seconds` | `number` |

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `events` | `SpeechEvent`[] |
| `source` | [`SpeechSource`](#speechsource) |
