# vrm

## Interfaces

### ToVrmOptions

Spring bones and meta name for turning a loaded avatar into a VRM.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-name"></a> `name?` | `string` | Name for the VRM meta; default "avatar". |

#### Methods

##### springs()?

```ts
springs?(root): VRMSpringBoneManager | null;
```

Spring bones, built once the model is in meters and at rest.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `root` | `Object3D` |

###### Returns

`VRMSpringBoneManager` \| `null`

***

### VrmHookOptions

Vertex cleanup and skeleton merge options of the VRM loader hook.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-combineskeletons"></a> `combineSkeletons?` | `boolean` | Merge skeletons so the skin update runs once per frame. Default true. |
| <a id="property-removeunusedvertices"></a> `removeUnusedVertices?` | `boolean` | Drop vertices no bone or morph uses. Default true. |

## Variables

### EYE\_RANGE

```ts
const EYE_RANGE: object;
```

Eye turn limits for non VRM eye bones, degrees: sideways 12, up and down 8 (vendor). Wider turns show the socket.

#### Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-pitch"></a> `pitch` | `8` | `8` |
| <a id="property-yaw"></a> `yaw` | `12` | `12` |

## Functions

### fromVrm()

```ts
function fromVrm(vrm, opts?): VrmResult;
```

Builds the result `loadAvatar` returns for a VRM.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `vrm` | `VRM` |
| `opts?` | [`VrmHookOptions`](#vrmhookoptions) |

#### Returns

[`VrmResult`](three.md#vrmresult)

***

### toVrm()

```ts
function toVrm(avatar, opts?): VRM;
```

Wraps a loaded non VRM avatar (GLB, FBX) in an in memory three-vrm `VRM`,
so one frame loop drives every format: a humanoid whose normalized bones
have identity rest rotations, an expression manager built from the rig
expression table, eye bone look at inside `EYE_RANGE`, and optional
springs. The model must be normalized (`loadAvatar` does that). Call
`vrm.update(dt)` each frame and pose the normalized bones.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `avatar` | `Pick`\<[`Avatar`](three.md#avatar), `"root"` \| `"bones"` \| `"vrm"`\> |
| `opts?` | [`ToVrmOptions`](#tovrmoptions) |

#### Returns

`VRM`

***

### vrmBones()

```ts
function vrmBones(vrm): Partial<Record<HumanBone, Object3D>>;
```

Normalized bones of a loaded VRM by VRM 1.0 name.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `vrm` | `VRM` |

#### Returns

`Partial`\<`Record`\<[`HumanBone`](index.md#humanbone), `Object3D`\>\>

***

### vrmExpressionSink()

```ts
function vrmExpressionSink(vrm): ExpressionSink;
```

The VRM expression manager as a sink; unknown names are ignored by three-vrm.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `vrm` | `VRM` |

#### Returns

[`ExpressionSink`](three.md#expressionsink)

***

### vrmHook()

```ts
function vrmHook(opts?): VrmHook;
```

Pass as `loadAvatar(src, { vrm: vrmHook() })`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts?` | [`VrmHookOptions`](#vrmhookoptions) |

#### Returns

[`VrmHook`](three.md#vrmhook)

***

### vrmMeta()

```ts
function vrmMeta(vrm): VrmMetaLike;
```

Metadata in the shape `checkRedistribution` reads.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `vrm` | `VRM` |

#### Returns

[`VrmMetaLike`](index.md#vrmmetalike)
