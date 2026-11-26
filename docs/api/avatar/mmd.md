# mmd

## Interfaces

### MmdAvatar

An MMD model loaded as an avatar, with its VRM result and the spring physics built from its rigid bodies.

#### Extends

- [`Avatar`](three.md#avatar)

#### Properties

| Property | Type | Description | Overrides | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="property-animations"></a> `animations` | `AnimationClip`[] | - | - | [`Avatar`](three.md#avatar).[`animations`](three.md#property-animations) |
| <a id="property-bones"></a> `bones` | `Partial`\<`Record`\<[`HumanBone`](index.md#humanbone), `Object3D`\>\> | - | - | [`Avatar`](three.md#avatar).[`bones`](three.md#property-bones) |
| <a id="property-dialect"></a> `dialect` | `string` | Rig family the mapper saw: mixamo, unreal (UAL), vroid and so on. | - | [`Avatar`](three.md#avatar).[`dialect`](three.md#property-dialect) |
| <a id="property-expressions"></a> `expressions` | [`ExpressionSink`](three.md#expressionsink) & `Partial`\<`Pick`\<[`ExpressionRig`](three.md#expressionrig), `"apply"` \| `"reset"` \| `"found"`\>\> | - | - | [`Avatar`](three.md#avatar).[`expressions`](three.md#property-expressions) |
| <a id="property-format"></a> `format` | `"unknown"` | - | [`Avatar`](three.md#avatar).[`format`](three.md#property-format) | - |
| <a id="property-head"></a> `head` | [`HeadHider`](three.md#headhider) \| `null` | - | - | [`Avatar`](three.md#avatar).[`head`](three.md#property-head-1) |
| <a id="property-humanoid"></a> `humanoid` | [`Humanoid`](three.md#humanoid) \| `null` | - | - | [`Avatar`](three.md#avatar).[`humanoid`](three.md#property-humanoid) |
| <a id="property-local"></a> `local` | `true` | Always true: an MMD model stays on the device it was dropped on. | - | - |
| <a id="property-physics"></a> `physics` | `object` | Spring colliders and joints built from the rigid bodies (computed). | - | - |
| `physics.colliders` | `number` | - | - | - |
| `physics.joints` | `number` | - | - | - |
| <a id="property-repair"></a> `repair` | [`RepairReport`](three.md#repairreport) \| `null` | - | - | [`Avatar`](three.md#avatar).[`repair`](three.md#property-repair) |
| <a id="property-root"></a> `root` | `Object3D` | - | - | [`Avatar`](three.md#avatar).[`root`](three.md#property-root) |
| <a id="property-vrm"></a> `vrm` | [`VrmResult`](three.md#vrmresult) | - | [`Avatar`](three.md#avatar).[`vrm`](three.md#property-vrm) | - |
| <a id="property-wardrobe"></a> `wardrobe` | [`Wardrobe`](three.md#wardrobe) | - | - | [`Avatar`](three.md#avatar).[`wardrobe`](three.md#property-wardrobe) |
| <a id="property-warnings"></a> `warnings` | `string`[] | - | - | [`Avatar`](three.md#avatar).[`warnings`](three.md#property-warnings) |

#### Methods

##### dispose()

```ts
dispose(): void;
```

Takes the body out of its parent and frees its geometry, materials, maps and bone textures.

###### Returns

`void`

###### Inherited from

[`Avatar`](three.md#avatar).[`dispose`](three.md#dispose)

##### update()

```ts
update(dt): void;
```

Call once per frame after the pose is written.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `dt` | `number` |

###### Returns

`void`

###### Inherited from

[`Avatar`](three.md#avatar).[`update`](three.md#update)

***

### MmdLoaderLike

The part of three-mmd's MMDLoader this module calls.

#### Methods

##### loadAsync()

```ts
loadAsync(url): Promise<{
  mesh: SkinnedMesh;
  pmx: MmdModelData;
}>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `url` | `string` |

###### Returns

`Promise`\<\{
  `mesh`: `SkinnedMesh`;
  `pmx`: [`MmdModelData`](#mmdmodeldata);
\}\>

##### setResourcePath()

```ts
setResourcePath(path): unknown;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `path` | `string` |

###### Returns

`unknown`

***

### MmdLoadOptions

Name, dropped textures, loading manager, unit and physics options of `loadMmd`.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-files"></a> `files?` | [`FileTextures`](three.md#filetextures) | From `managerForFiles` over the dropped folder: textures resolve by path, then by name. |
| <a id="property-manager"></a> `manager?` | `LoadingManager` | - |
| <a id="property-name"></a> `name?` | `string` | File name, for the meta and the wardrobe. |
| <a id="property-normalize"></a> `normalize?` | `Omit`\<[`NormalizeOptions`](three.md#normalizeoptions), `"unit"` \| `"deform"`\> | - |
| <a id="property-parser"></a> `parser?` | () => `Promise`\<\{ `MMDLoader`: new (`manager?`) => [`MmdLoaderLike`](#mmdloaderlike); \}\> | The parser module; default `import("@moeru/three-mmd")`. |
| <a id="property-springs"></a> `springs?` | `boolean` | Rigid bodies as spring bones. Default true. |
| <a id="property-unit"></a> `unit?` | `number` | Meters per model unit; default `MMD_UNIT`. |

***

### MmdModelData

The parts of a parsed PMX model the spring builder reads.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-bones-1"></a> `bones` | readonly `object`[] |
| <a id="property-rigidbodies"></a> `rigidBodies` | readonly [`MmdRigidBody`](#mmdrigidbody)[] |

***

### MmdRigidBody

The parts of a parsed PMX rigid body the spring builder reads.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-boneindex"></a> `boneIndex` | `number` | - |
| <a id="property-lineardamping"></a> `linearDamping` | `number` | - |
| <a id="property-name-1"></a> `name?` | `string` | - |
| <a id="property-physicsmode"></a> `physicsMode` | `number` | 0 follows its bone, 1 simulated, 2 simulated with the bone's position. |
| <a id="property-shapeposition"></a> `shapePosition` | `Vec3` | Rest position in model space, model units. |
| <a id="property-shaperotation"></a> `shapeRotation` | `Vec3` | - |
| <a id="property-shapesize"></a> `shapeSize` | `Vec3` | - |
| <a id="property-shapetype"></a> `shapeType` | `number` | 0 sphere, 1 box, 2 capsule. |

## Type Aliases

### MmdSource

```ts
type MmdSource = Blob | ArrayBuffer | ArrayBufferView | string | URL;
```

What `loadMmd` reads: a file, bytes or a URL.

## Variables

### MMD\_LOCAL\_COPY

```ts
const MMD_LOCAL_COPY: "mmd models usually forbid sharing. this one stays on this device." = "mmd models usually forbid sharing. this one stays on this device.";
```

The readme limits of most MMD models, said once on load.

***

### MMD\_UNIT

```ts
const MMD_UNIT: 0.08 = 0.08;
```

Meters per MMD unit (vendor, the MMD convention of 8 cm).

## Functions

### buildSprings()

```ts
function buildSprings(
   model, 
   bones, 
   humanoid, 
   unit
): VRMSpringBoneManager | null;
```

MMD rigid bodies as three-vrm spring bones. A body that follows its bone
becomes a collider on that bone; a simulated body on a bone outside the
humanoid becomes a joint from the bone to its child. `bones` is the
skeleton in PMX order, `unit` meters per model unit. Rigid bodies are
given at rest in model space, where every MMD bone is unrotated, so a
body's offset from its bone is its offset in the bone's own frame. Null
when no body is simulated.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `model` | [`MmdModelData`](#mmdmodeldata) |
| `bones` | readonly `Bone`\<`Object3DEventMap`\>[] |
| `humanoid` | `ReadonlySet`\<`Object3D`\<`Object3DEventMap`\>\> |
| `unit` | `number` |

#### Returns

`VRMSpringBoneManager` \| `null`

***

### loadMmd()

```ts
function loadMmd(src, opts?): Promise<MmdAvatar>;
```

Loads a dropped PMX or PMD model into the normalized humanoid space and
wraps it as a VRM: `avatar.vrm.vrm` is the three-vrm `VRM`, its
normalized bones are `avatar.bones`, and `avatar.update(dt)` steps
expressions, gaze and springs. Needs the rig wasm: `await load()`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `src` | [`MmdSource`](#mmdsource) |
| `opts?` | [`MmdLoadOptions`](#mmdloadoptions) |

#### Returns

`Promise`\<[`MmdAvatar`](#mmdavatar)\>

***

### mmdFormat()

```ts
function mmdFormat(bytes): "pmx" | "pmd" | null;
```

"pmx" or "pmd" from the first bytes, else null.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `bytes` | `Uint8Array` |

#### Returns

`"pmx"` \| `"pmd"` \| `null`

***

### spineUnderHips()

```ts
function spineUnderHips(bones): boolean;
```

MMD hangs the upper and lower body side by side under the center bone; a
VRM spine grows out of its hips. Moves the upper body under the lower one
at the same world transform, so turning the hips turns the whole figure.
Returns true when it moved anything.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `bones` | `Partial`\<`Record`\<[`HumanBone`](index.md#humanbone), `Object3D`\>\> |

#### Returns

`boolean`

***

### springSettings()

```ts
function springSettings(
   boneName, 
   linearDamping, 
   sizeX, 
   unit
): object;
```

Joint settings for a simulated bone: skirts a little stiffer than hair and ribbons (vendor).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `boneName` | `string` |
| `linearDamping` | `number` |
| `sizeX` | `number` |
| `unit` | `number` |

#### Returns

`object`

| Name | Type | Default value |
| ------ | ------ | ------ |
| `dragForce` | `number` | - |
| `gravityDir` | `Vector3` | - |
| `gravityPower` | `number` | `0.35` |
| `hitRadius` | `number` | - |
| `stiffness` | `number` | - |
