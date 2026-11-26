# three

## Interfaces

### MappedObject

The result of `mapObject3D`: the map report, the scene object of each humanoid bone, and the nodes in report order.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-bones"></a> `bones` | `Partial`\<`Record`\<[`HumanBone`](bones.md#humanbone), `Object3D`\>\> | Humanoid bone to scene object. |
| <a id="property-nodes"></a> `nodes` | `Object3D`\<`Object3DEventMap`\>[] | - |
| <a id="property-report"></a> `report` | [`RigMapReport`](index.md#rigmapreport) | - |

***

### RestFixOptions

Options of `applyRestFix`.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-headheight"></a> `headHeight?` | `number` | Target height for the head joint in meters; default keeps the measured size. |
| <a id="property-straightlegs"></a> `straightLegs?` | `boolean` | Straighten splayed legs. Default false. |
| <a id="property-tposearms"></a> `tPoseArms?` | `boolean` | Lift A pose arms into the T pose. Default true. |

## Functions

### applyRestFix()

```ts
function applyRestFix(
   root, 
   bones, 
   report, 
   opts?
): Group;
```

Wraps `root` in a group that faces it +Z, scales it to meters and puts its
feet on y = 0, then lifts A pose arms into the T pose. Returns the group.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `root` | `Object3D` |
| `bones` | `Partial`\<`Record`\<[`HumanBone`](bones.md#humanbone), `Object3D`\>\> |
| `report` | [`RestReport`](index.md#restreport) |
| `opts?` | [`RestFixOptions`](#restfixoptions) |

#### Returns

`Group`

***

### chainsOf()

```ts
function chainsOf(root): object;
```

Limb chains under `root` with poles measured from the current world pose.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `root` | `Object3D` |

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `chains` | [`LimbChain`](index.md#limbchain)[] |
| `nodes` | `Object3D`\<`Object3DEventMap`\>[] |

***

### mapObject3D()

```ts
function mapObject3D(root): MappedObject;
```

Maps the bones under `root`. Only `Bone` objects are considered when the
model has any; otherwise every named node.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `root` | `Object3D` |

#### Returns

[`MappedObject`](#mappedobject)

***

### restOf()

```ts
function restOf(bones): RestReport | null;
```

Rest analysis of mapped bones at their current world positions.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `bones` | `Partial`\<`Record`\<[`HumanBone`](bones.md#humanbone), `Object3D`\>\> |

#### Returns

[`RestReport`](index.md#restreport) \| `null`
