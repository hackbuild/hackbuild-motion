# index

## Classes

### AvatarHost

Shows one source at a time through adapters: each show takes a ticket, a load that a later show overtook is discarded, and runtimes are shared or destroyed by key.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-s"></a> `S` *extends* [`HostSource`](#hostsource) |
| <a id="type-parameter-t"></a> `T` |

#### Constructors

##### Constructor

```ts
new AvatarHost<S, T>(opts): AvatarHost<S, T>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts` | [`AvatarHostOptions`](#avatarhostoptions)\<`S`, `T`\> |

###### Returns

[`AvatarHost`](#avatarhost)\<`S`, `T`\>

#### Accessors

##### current

###### Get Signature

```ts
get current(): T | null;
```

The result of the latest show that finished and was not superseded.

###### Returns

`T` \| `null`

##### runtimes

###### Get Signature

```ts
get runtimes(): string[];
```

Runtime keys alive now.

###### Returns

`string`[]

#### Methods

##### destroy()

```ts
destroy(): void;
```

Supersedes any load in flight and destroys every runtime.

###### Returns

`void`

##### show()

```ts
show(source): Promise<T | null>;
```

Resolves to the loaded result, or null when a later show superseded this
one; a superseded load's result is discarded and its error dropped.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `source` | `S` \| `Promise`\<`S`\> |

###### Returns

`Promise`\<`T` \| `null`\>

***

### StageLoop

The render loop of a stage: runs frames on the renderer's animation loop and stops while the page is hidden, off screen, covered, lost or paused.

#### Constructors

##### Constructor

```ts
new StageLoop(opts): StageLoop;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts` | [`StageLoopOptions`](#stageloopoptions) |

###### Returns

[`StageLoop`](#stageloop)

#### Properties

| Property | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| <a id="property-frames"></a> `frames` | `number` | `0` | Frames drawn since the loop was made. |
| <a id="property-time"></a> `time` | `number` | `0` | The loop clock in seconds: the sum of every delta handed to `frame`. |

#### Accessors

##### isRunning

###### Get Signature

```ts
get isRunning(): boolean;
```

###### Returns

`boolean`

##### paused

###### Get Signature

```ts
get paused(): boolean;
```

###### Returns

`boolean`

##### reducedMotion

###### Get Signature

```ts
get reducedMotion(): boolean;
```

###### Returns

`boolean`

###### Set Signature

```ts
set reducedMotion(on): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `on` | `boolean` |

###### Returns

`void`

##### why

###### Get Signature

```ts
get why(): PauseReason[];
```

The reasons that hold now.

###### Returns

[`PauseReason`](#pausereason)[]

#### Methods

##### dispose()

```ts
dispose(): void;
```

###### Returns

`void`

##### hold()

```ts
hold(reason, on): void;
```

Sets or clears one pause reason.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `reason` | [`PauseReason`](#pausereason) |
| `on` | `boolean` |

###### Returns

`void`

##### invalidate()

```ts
invalidate(): void;
```

Something changed: draw at least one more frame.

###### Returns

`void`

##### pause()

```ts
pause(reason?): void;
```

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `reason?` | [`PauseReason`](#pausereason) | `"paused"` |

###### Returns

`void`

##### resume()

```ts
resume(reason?): void;
```

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `reason?` | [`PauseReason`](#pausereason) | `"paused"` |

###### Returns

`void`

##### sync()

```ts
sync(): void;
```

Recomputes whether the loop should run; call after `busy` turns true.

###### Returns

`void`

## Interfaces

### Adapter

Loads one kind of source: makes a runtime once, loads sources into it, and may destroy it.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-s-1"></a> `S` *extends* [`HostSource`](#hostsource) | - |
| <a id="type-parameter-t-1"></a> `T` | - |
| <a id="type-parameter-r"></a> `R` | `unknown` |

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-key"></a> `key?` | `string` | Runtimes are shared by adapters with the same key. Default: the kind. |

#### Methods

##### create()

```ts
create(): Promise<R>;
```

###### Returns

`Promise`\<`R`\>

##### destroy()?

```ts
destroy?(runtime): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `runtime` | `R` |

###### Returns

`void`

##### load()

```ts
load(runtime, source): Promise<T>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `runtime` | `R` |
| `source` | `S` |

###### Returns

`Promise`\<`T`\>

***

### AvatarHostOptions

The adapters by kind, the exclusive switch and the discard call of an `AvatarHost`.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-s-2"></a> `S` *extends* [`HostSource`](#hostsource) |
| <a id="type-parameter-t-2"></a> `T` |

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-adapters"></a> `adapters` | `Partial`\<`Record`\<`string`, [`Adapter`](#adapter)\<`S`, `T`, `unknown`\>\>\> | By kind. Each adapter carries its own runtime type; the host only passes it back. |
| <a id="property-exclusive"></a> `exclusive?` | `boolean` | Destroy the runtimes of other keys on a switch (one stage). Without it they stay for reuse. |

#### Methods

##### discard()?

```ts
discard?(result): void;
```

Frees a result that lost to a later show and is never shown.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `result` | `T` |

###### Returns

`void`

***

### BodySource

A model to show: its kind, its file as a URL, bytes or Blob, its name, and how its referenced files resolve.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-data"></a> `data` | `string` \| `Blob` \| `URL` \| `ArrayBuffer` \| `ArrayBufferView`\<`ArrayBufferLike`\> | The model file: a URL, bytes or a Blob (a dropped File). |
| <a id="property-kind"></a> `kind` | [`BodyKind`](#bodykind) | - |
| <a id="property-misses"></a> `misses?` | `string`[] | References `resolve` could not find, for the failure copy. |
| <a id="property-name"></a> `name` | `string` | File name; it names the body and helps the format sniff. |

#### Methods

##### release()?

```ts
release?(): void;
```

Frees the object URLs the source made; the host calls it once the load settles.

###### Returns

`void`

##### resolve()?

```ts
resolve?(ref): string | null;
```

A URL for a file the model references, or null when the drop has none.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ref` | `string` |

###### Returns

`string` \| `null`

***

### DropLike

The parts of a DataTransfer that `filesFromDrop` reads: entries and files.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-files"></a> `files?` | `ArrayLike`\<`File`\> |
| <a id="property-items"></a> `items?` | `ArrayLike`\<\{ `webkitGetAsEntry?`(): [`EntryLike`](#entrylike) \| `null`; \}\> |

***

### DroppedFile

A dropped file: a Blob with a name and, from a folder, a relative path.

#### Extends

- `Blob`

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-name-1"></a> `name` | `readonly` | `string` |
| <a id="property-webkitrelativepath"></a> `webkitRelativePath?` | `readonly` | `string` |

***

### EntryLike

The parts of FileSystemEntry the walk reads; tests pass plain objects.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-fullpath"></a> `fullPath` | `string` |
| <a id="property-isdirectory"></a> `isDirectory` | `boolean` |
| <a id="property-isfile"></a> `isFile` | `boolean` |

#### Methods

##### createReader()?

```ts
createReader?(): object;
```

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `readEntries()` | (`ok`, `fail?`) => `void` |

##### file()?

```ts
file?(ok, fail?): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ok` | (`f`) => `void` |
| `fail?` | (`e`) => `void` |

###### Returns

`void`

***

### HostSource

The least a host source carries: its kind and an optional release call.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-kind-1"></a> `kind` | `string` |

#### Methods

##### release()?

```ts
release?(): void;
```

###### Returns

`void`

***

### LoopDriver

The one call of WebGLRenderer the loop needs.

#### Methods

##### setAnimationLoop()

```ts
setAnimationLoop(cb): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `cb` | ((`time`) => `void`) \| `null` |

###### Returns

`void`

***

### StageLoopOptions

The renderer driver, the frame call, the busy test and timing options of a `StageLoop`.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-driver"></a> `driver` | [`LoopDriver`](#loopdriver) | - |
| <a id="property-fixedstep"></a> `fixedStep?` | `number` | Seconds of the first delta after a stop. Default 1 / 60 (proposed, one 60 Hz frame). |
| <a id="property-maxstep"></a> `maxStep?` | `number` | Longest delta in seconds, for a stalled main thread. Default 0.1 (proposed). |

#### Methods

##### busy()?

```ts
busy?(): boolean;
```

True while something moves; under reduced motion the loop stops once this is false.

###### Returns

`boolean`

##### frame()

```ts
frame(dt, time): void;
```

One frame: `dt` in seconds, `time` the loop clock in seconds (the sum of deltas).

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `dt` | `number` |
| `time` | `number` |

###### Returns

`void`

##### onState()?

```ts
onState?(running, reasons): void;
```

Called when the loop starts or stops, with the reasons that hold.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `running` | `boolean` |
| `reasons` | [`PauseReason`](#pausereason)[] |

###### Returns

`void`

***

### UrlFactory

Makes and revokes object URLs; swap it in tests.

#### Methods

##### create()

```ts
create(b): string;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `b` | `Blob` |

###### Returns

`string`

##### revoke()

```ts
revoke(url): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `url` | `string` |

###### Returns

`void`

## Type Aliases

### BodyKind

```ts
type BodyKind = "vrm" | "glb" | "gltf" | "fbx";
```

The model formats a body source can be.

***

### PauseReason

```ts
type PauseReason = "hidden" | "offscreen" | "inactive" | "covered" | "lost" | "paused";
```

Why a stage loop is stopped: hidden, off screen, inactive, covered, context lost or paused.

## Functions

### bodyError()

```ts
function bodyError(e): string;
```

Copy for the person from a load or start failure. Copy this package already wrote passes through.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `e` | `unknown` |

#### Returns

`string`

***

### droppedFiles()

```ts
function droppedFiles(dt): Promise<File[]>;
```

The files of a drop; folders are walked when the browser gives entries.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `dt` | [`DropLike`](#droplike) |

#### Returns

`Promise`\<`File`[]\>

***

### filesFromEntries()

```ts
function filesFromEntries(entries): Promise<File[]>;
```

Every file under the entries, each with `webkitRelativePath` set from its place in the drop.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entries` | readonly [`EntryLike`](#entrylike)[] |

#### Returns

`Promise`\<`File`[]\>

***

### kindOf()

```ts
function kindOf(name): BodyKind | null;
```

The body kind a file name says, or null.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |

#### Returns

[`BodyKind`](#bodykind) \| `null`

***

### normalizeRef()

```ts
function normalizeRef(ref): string;
```

Lower case, forward slashes, no leading ./ and no URL escapes.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ref` | `string` |

#### Returns

`string`

***

### sourceFromFiles()

```ts
function sourceFromFiles(files, urls?): BodySource;
```

A source from dropped or picked files: the first .vrm, .glb, .gltf or .fbx,
with every other file reachable through `resolve`. Throws with the copy
for the person when the drop holds no model the stage reads.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `files` | readonly [`DroppedFile`](#droppedfile)[] | `undefined` |
| `urls?` | [`UrlFactory`](#urlfactory) | `browserUrls` |

#### Returns

[`BodySource`](#bodysource)

***

### sourceFromUrl()

```ts
function sourceFromUrl(url, name?): BodySource;
```

A model by URL; the kind comes from the name, glb when it says nothing.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `url` | `string` |
| `name?` | `string` |

#### Returns

[`BodySource`](#bodysource)
